// webapp/src/services/assinaturaNexofyService.js
//
// PED-115 — chama a edge function que cria a assinatura recorrente do
// estúdio na Asaas master. Mesmo padrão de tratamento de erro de
// estudioAsaasService.js/ConfiguracoesPagamentos.jsx: supabase-js não
// rejeita a Promise em erros HTTP 4xx/5xx da function, o corpo de erro
// vem em `data` mesmo assim quando `error` existe.
import { supabase } from '../lib/supabase';

export async function assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular }) {
  const { data, error } = await supabase.functions.invoke('assinar-plano-nexofy', {
    body: { estudioId, plano, ciclo, cartao, titular },
  });

  if (error) {
    const mensagem = data?.erro || error.message || 'Erro ao processar assinatura.';
    throw new Error(mensagem);
  }

  return data;
}
