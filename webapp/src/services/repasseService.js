// gestao_web/src/services/repasseService.js

import { supabase } from '../lib/supabase';

/**
 * Gera repasses a partir de um pagamento de mensalidade confirmado.
 * Chamado automaticamente em confirmarPagamento e adicionarPagamentoManual.
 *
 * FIX (sprint RLS): a edge function gerar-repasses usa service role e exige
 * estudioId no body para isolamento manual — sem ele, todas as chamadas
 * retornavam 400.
 */
export async function gerarRepassesDaMensalidade(mensalidadeId, estudioId) {
  if (!estudioId) {
    throw new Error('gerarRepassesDaMensalidade: estudioId é obrigatório.');
  }

  const { data, error } = await supabase.functions.invoke('gerar-repasses', {
    body: { estudioId, mensalidadeId },
  });

  if (error) throw error;
  return data;
}

/**
 * DRY-RUN: calcula os repasses mensais SEM inserir nada no banco.
 * Retorna o resumo por professor para exibição no modal de confirmação.
 *
 * @param {number} mes        - Mês (1–12)
 * @param {number} ano        - Ano (ex: 2025)
 * @param {string} estudioId  - UUID do estúdio (obrigatório — service role)
 * @returns {{ jaGerados, totalGeral, professores, avisos, lancamentosPrevistos, config }}
 */
export async function previewRepassesMensais(mes, ano, estudioId) {
  if (!estudioId) {
    throw new Error('previewRepassesMensais: estudioId é obrigatório.');
  }

  const { data, error } = await supabase.functions.invoke('preview-repasses-mensais', {
    body: { estudioId, mes, ano },
  });

  if (error) throw error;
  return data;
}

/**
 * Gera repasses mensais com base nos alunos MATRICULADOS nas modalidades,
 * independente de pagamento. Deve ser executado uma vez por mês pelo admin.
 *
 * @param {number} mes        - Mês (1–12)
 * @param {number} ano        - Ano (ex: 2025)
 * @param {string} estudioId  - UUID do estúdio (obrigatório — service role)
 */
export async function gerarRepassesMensais(mes, ano, estudioId) {
  if (!estudioId) {
    throw new Error('gerarRepassesMensais: estudioId é obrigatório.');
  }

  const { data, error } = await supabase.functions.invoke('gerar-repasses-mensais', {
    body: { estudioId, mes, ano },
  });

  if (error) throw error;
  return data;
}

/**
 * Lista os repasses de um professor em um determinado mês/ano.
 * Usado na página de comissões do professor e pelo admin.
 *
 * FIX (defesa em profundidade): antes a query confiava exclusivamente na RLS
 * de `repasses_lancamentos` (tenant_select + professor_self_repasses) para o
 * isolamento entre estúdios, sem nenhum filtro client-side. Alinhando com o
 * padrão do resto do projeto (leadsService, presencaService etc.), agora
 * `estudioId` é obrigatório e filtrado explicitamente também no client —
 * a RLS continua sendo a barreira principal, isso é só uma segunda camada
 * caso uma policy futura seja alterada/afrouxada por engano.
 *
 * @param {string} professorId
 * @param {string} mesAno    - formato 'YYYY-MM'
 * @param {string} estudioId - UUID do estúdio (obrigatório)
 */
export async function listarRepassesProfessor(professorId, mesAno, estudioId) {
  if (!estudioId) {
    throw new Error('listarRepassesProfessor: estudioId é obrigatório.');
  }
  if (!/^\d{4}-\d{2}$/.test(mesAno)) {
    throw new Error(`listarRepassesProfessor: mesAno inválido "${mesAno}" (esperado "AAAA-MM").`);
  }

  const inicio = `${mesAno}-01`;
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;

  // REP-05: adicionados status e pago_em — sem eles r.status retorna undefined
  // no componente ProfessorComissoes.jsx e os KPIs confirmado/qtdPaga ficam zerados.
  const { data, error } = await supabase
    .from('repasses_lancamentos')
    .select('id, valor, tipo_aula, modalidade, data_referencia, status, pago_em, alunos(nome_completo)')
    .eq('professor_id', professorId)
    .eq('estudio_id', estudioId) // defesa em profundidade, além da RLS
    .gte('data_referencia', inicio)
    .lte('data_referencia', fim)
    .order('data_referencia', { ascending: false });

  if (error) throw error;
  return data;
}