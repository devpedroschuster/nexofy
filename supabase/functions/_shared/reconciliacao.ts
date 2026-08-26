// supabase/functions/_shared/reconciliacao.ts
//
// PED-17 — detecção de divergências financeiras usando SÓ dados já
// sincronizados localmente (mensalidades.asaas_status/asaas_payment_id,
// preenchidos pelo webhook-pagamento) comparados contra repasses_lancamentos.
// Não chama a API do Asaas — decisão de produto: relatório rápido, sem
// depender de disponibilidade/rate-limit externo. Se `asaas_status` local
// estiver desatualizado (bug no webhook), este relatório não pega esse
// caso — é uma limitação conhecida, não um bug deste módulo.
//
// Função pura (sem I/O) para ser testável sem mocks de banco/rede.

// Tipos de aula que geram repasse — mesmo conjunto tratado em
// _shared/repasses.ts (gerarRepassesParaMensalidade). Mantido em sincronia
// manualmente: se um novo tipo de aula passar a gerar repasse lá, adicionar
// aqui também.
const TIPOS_QUE_GERAM_REPASSE = new Set(["regular", "plano_livre", "avulsa", "experimental"]);

const TOLERANCIA_CENTAVOS = 0.01;

export interface MensalidadeReconciliacao {
  id: string;
  aluno_id: string | null;
  tipo_aula: string;
  status: string;
  valor_pago: number | null;
  valor_cobranca: number | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  data_vencimento: string;
}

export interface RepasseReconciliacao {
  mensalidade_id: string | null;
}

export interface Divergencia {
  mensalidadeId: string;
  tipos: string[];
  detalhes: string[];
}

export function detectarDivergencias(
  mensalidades: MensalidadeReconciliacao[],
  repasses: RepasseReconciliacao[],
  hoje: Date,
): Divergencia[] {
  const mensalidadesComRepasse = new Set(
    repasses.map(r => r.mensalidade_id).filter((id): id is string => id !== null),
  );
  const hojeIso = hoje.toISOString().substring(0, 10);

  const resultado: Divergencia[] = [];

  for (const m of mensalidades) {
    const tipos: string[] = [];
    const detalhes: string[] = [];

    if (m.status === "pago" && m.valor_pago === null) {
      tipos.push("pago_sem_valor");
      detalhes.push("Status é 'pago' mas valor_pago está nulo.");
    }

    if (
      m.status === "pago" &&
      m.aluno_id !== null &&
      TIPOS_QUE_GERAM_REPASSE.has(m.tipo_aula) &&
      !mensalidadesComRepasse.has(m.id)
    ) {
      tipos.push("pago_sem_repasse");
      detalhes.push(`Mensalidade paga (tipo '${m.tipo_aula}') sem nenhum repasse gerado.`);
    }

    if (
      m.status === "pago" &&
      m.valor_pago !== null &&
      m.valor_cobranca !== null &&
      Math.abs(m.valor_pago - m.valor_cobranca) > TOLERANCIA_CENTAVOS
    ) {
      tipos.push("valor_divergente");
      detalhes.push(`valor_pago (${m.valor_pago}) difere de valor_cobranca (${m.valor_cobranca}).`);
    }

    if (
      m.asaas_payment_id !== null &&
      m.asaas_status === null &&
      m.status === "pendente" &&
      m.data_vencimento < hojeIso
    ) {
      tipos.push("sem_retorno_webhook");
      detalhes.push("Cobrança criada no Asaas e vencida, mas nunca recebemos nenhum retorno de status via webhook.");
    }

    if (tipos.length > 0) {
      resultado.push({ mensalidadeId: m.id, tipos, detalhes });
    }
  }

  return resultado;
}
