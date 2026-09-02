import { supabase } from '../lib/supabase';
import { SEGMENTOS } from '../lib/terminologia';

// Item 2 do plano multi-segmento (seção 4 do PLANO_ITEM_2.md): segmento,
// terminologia e modulos_ativos entram na allowlist de atualizarEstudio.
// Sem isso, a UI nova de ConfiguracoesEstudio.jsx salvaria e o payload
// seria silenciosamente descartado no filter abaixo — mesma allowlist
// server-adjacent que já protege os campos existentes.
//
// PED-120: `instagram_url` não existe na tabela `estudios` — a coluna
// real chama-se `instagram` (ver supabase/migrations/00000000000000_
// baseline_current_schema.sql). Com o nome errado, todo `.update()` que
// incluísse esse campo estourava 42703 no PostgREST. `logo_url` existe
// de verdade mas estava fora da allowlist: uploadLogo() chama
// atualizarEstudio(estudioId, { logo_url }), e o filter abaixo reduzia o
// payload a `{}` — upload "funcionava" mas a URL nunca era persistida.
const CAMPOS_PERMITIDOS = [
  'nome', 'whatsapp', 'instagram', 'maps_url', 'logo_url',
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

// PED-9/PED-10: helper único pro merge atômico de `landing_config`,
// reaproveitado tanto pelo upload de capa quanto pelo formulário de
// headline/subheadline/sobre_texto (PED-10) — nenhum dos dois usa
// atualizarEstudio() aqui porque um UPDATE ingênuo apagaria as chaves
// que o outro fluxo já tinha salvo (ver comentário da RPC no Postgres).
async function atualizarLandingConfig(estudioId, patch) {
  const { data, error } = await supabase.rpc('atualizar_landing_config', {
    p_estudio_id: estudioId,
    p_patch: patch,
  });
  if (error) throw error;
  return data;
}

// PED-10: salva headline/subheadline/sobre_texto do mini page-builder.
// Valores vazios viram `null` no patch — sem isso, string vazia
// persistiria como override "de propósito" e a landing pública nunca
// mais cairia no fallback do segmento pra aquele campo específico.
export async function salvarLandingTexto(estudioId, { headline, subheadline, sobre_texto }) {
  return atualizarLandingConfig(estudioId, {
    headline: headline?.trim() || null,
    subheadline: subheadline?.trim() || null,
    sobre_texto: sobre_texto?.trim() || null,
  });
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

  await atualizarLandingConfig(estudioId, { imagem_capa_url: urlComCacheBuster });

  return urlComCacheBuster;
}