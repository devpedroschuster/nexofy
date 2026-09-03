// webapp/src/services/assinaturaNexofyService.js
//
// PED-115 — chama a edge function que cria a assinatura recorrente do
// estúdio na Asaas master. Usa extrairMensagemErro (edgeFunctionError.js)
// porque supabase.functions.invoke() NÃO parseia o corpo JSON em respostas
// não-2xx — sem isso, toda mensagem de erro de negócio da function
// (cartão recusado, campos faltando, etc.) ficava invisível pro usuário,
// substituída pelo texto genérico do SDK.
import { supabase } from '../lib/supabase';
import { extrairMensagemErro } from '../lib/edgeFunctionError';

export async function assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular }) {
  const { data, error } = await supabase.functions.invoke('assinar-plano-nexofy', {
    body: { estudioId, plano, ciclo, cartao, titular },
  });

  if (error) {
    throw new Error(await extrairMensagemErro(error, 'Erro ao processar assinatura.'));
  }

  return data;
}
