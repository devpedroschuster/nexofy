import { supabase } from '../lib/supabase';
import { SEGMENTOS } from '../lib/terminologia';

// Item 2 do plano multi-segmento (seção 4 do PLANO_ITEM_2.md): segmento,
// terminologia e modulos_ativos entram na allowlist de atualizarEstudio.
// Sem isso, a UI nova de ConfiguracoesEstudio.jsx salvaria e o payload
// seria silenciosamente descartado no filter abaixo — mesma allowlist
// server-adjacent que já protege os campos existentes.
const CAMPOS_PERMITIDOS = [
  'nome', 'whatsapp', 'instagram_url', 'maps_url',
  'email_suporte', 'cor_primaria', 'cor_secundaria', 'timezone',
  'segmento', 'terminologia', 'modulos_ativos',
];

const SEGMENTOS_VALIDOS = SEGMENTOS.map((s) => s.value);

export async function atualizarEstudio(estudioId, dados) {
  const payload = Object.fromEntries(
    Object.entries(dados).filter(([k]) => CAMPOS_PERMITIDOS.includes(k))
  );

  // Defesa em profundidade além do `check` da migration (estudios_segmento_check):
  // recusa cedo, com erro tratável na UI, em vez de deixar o Postgres
  // estourar um erro cru de constraint.
  if ('segmento' in payload && !SEGMENTOS_VALIDOS.includes(payload.segmento)) {
    throw new Error(`Segmento inválido: "${payload.segmento}".`);
  }

  const { error } = await supabase
    .from('estudios')
    .update(payload)
    .eq('id', estudioId);

  if (error) throw error;
}

export async function uploadLogo(estudioId, file) {
  const path = `${estudioId}/logo.png`;

  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  await atualizarEstudio(estudioId, { logo_url: data.publicUrl });
  return data.publicUrl;
}

// PED-9: upload da foto de capa da landing (Nível 3, mini page-builder).
// `imagem_capa_url` mora dentro do jsonb `landing_config`, junto com
// headline/subheadline/sobre_texto (PED-10) — por isso não usamos
// atualizarEstudio() aqui (que faria um UPDATE ingênuo e apagaria as
// outras chaves), e sim a RPC atualizar_landing_config, que faz merge
// atômico (`||`) no Postgres.
//
// Extensão fixa em vez do nome original do arquivo: evita path traversal
// e caracteres especiais no path do Storage (mesmo raciocínio de
// uploadLogo, que já usa `logo.png` fixo em vez do nome original).
export async function uploadImagemCapa(estudioId, file) {
  const extensao = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : 'jpg';
  const path = `${estudioId}/capa.${extensao}`;

  // upsert só sobrescreve quando o path é idêntico. Como a extensão
  // varia por mimetype (capa.png vs capa.jpg vs capa.webp), trocar o
  // formato deixaria o arquivo antigo órfão no bucket. Por isso listamos
  // e removemos qualquer `capa.*` anterior do estúdio antes de subir o novo.
  const { data: arquivosExistentes, error: listError } = await supabase.storage
    .from('landing-covers')
    .list(estudioId);
  if (listError) throw listError;

  const antigos = (arquivosExistentes ?? [])
    .filter((f) => f.name.startsWith('capa.') && f.name !== `capa.${extensao}`)
    .map((f) => `${estudioId}/${f.name}`);
  if (antigos.length > 0) {
    const { error: removeError } = await supabase.storage.from('landing-covers').remove(antigos);
    if (removeError) throw removeError;
  }

  const { error: uploadError } = await supabase.storage
    .from('landing-covers')
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('landing-covers').getPublicUrl(path);

  // cache-busting: upsert mantém o mesmo path, então sem um param único
  // o browser/CDN serviria a imagem antiga do cache após a troca.
  const urlComCacheBuster = `${data.publicUrl}?v=${Date.now()}`;

  const { error: rpcError } = await supabase.rpc('atualizar_landing_config', {
    p_estudio_id: estudioId,
    p_patch: { imagem_capa_url: urlComCacheBuster },
  });
  if (rpcError) throw rpcError;

  return urlComCacheBuster;
}