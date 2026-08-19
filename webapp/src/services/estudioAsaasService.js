import { supabase } from '../lib/supabase';

const CAMPOS_PERMITIDOS = [
  'nome_responsavel', 'email_responsavel', 'telefone_celular', 'telefone_fixo',
  'cnpj', 'company_type', 'faturamento_mensal', 'site',
  'cep', 'endereco', 'numero', 'complemento', 'bairro',
];

const COMPANY_TYPES_VALIDOS = ['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'];

export async function buscarDadosAsaas(estudioId) {
  const { data, error } = await supabase
    .from('estudio_dados_asaas')
    .select('*')
    .eq('estudio_id', estudioId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function salvarDadosAsaas(estudioId, dados) {
  const payload = Object.fromEntries(
    Object.entries(dados).filter(([k]) => CAMPOS_PERMITIDOS.includes(k))
  );

  if ('company_type' in payload && payload.company_type && !COMPANY_TYPES_VALIDOS.includes(payload.company_type)) {
    throw new Error(`Tipo de empresa inválido: "${payload.company_type}".`);
  }

  const { error } = await supabase
    .from('estudio_dados_asaas')
    .upsert(
      { estudio_id: estudioId, ...payload },
      { onConflict: 'estudio_id' }
    );

  if (error) throw error;
}