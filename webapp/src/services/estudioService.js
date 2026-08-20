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