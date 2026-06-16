// webapp/src/services/estudioService.js
import { supabase } from '../lib/supabase';

/**
 * Atualiza os dados do estúdio.
 * O RLS garante que apenas o admin do estúdio pode atualizar.
 */
export async function atualizarEstudio(estudioId, dados) {
  const { error } = await supabase
    .from('estudios')
    .update(dados)
    .eq('id', estudioId);

  if (error) throw error;
}

/**
 * Faz upload do logo para o bucket "logos" (público).
 * Path: "{estudio_id}/logo.png"
 * Após o upload, atualiza a coluna logo_url na tabela estudios.
 *
 * @param {string} estudioId - UUID do estúdio
 * @param {File}   file      - Arquivo de imagem selecionado pelo usuário
 * @returns {string} URL pública do logo
 */
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