// Tipos espelhando o schema real (supabase/migrations/00000000000000_baseline_current_schema.sql).
// Nenhum campo aqui deve existir sem uma coluna correspondente no banco.

export interface Estudio {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  whatsapp: string | null;
  cor_primaria: string; // default '#FFD600'
  cor_secundaria: string | null;
  segmento: string; // multi-segmento: 'danca_fitness' | 'pilates' | 'crossfit' | ...
  terminologia: Record<string, string>;
  modulos_ativos: string[]; // ex: ['agenda','financeiro','presenca','alunos']
  timezone: string;
  status: string;
  // Novas colunas propostas na spec (ainda não existem — ver seção "Trabalho de
  // backend novo" em docs/superpowers/specs/2026-09-09-app-mobile-area-aluno-design.md):
  horas_min_cancelamento?: number;
  dias_tolerancia_inadimplencia?: number;
}

export interface RegraAcesso {
  modalidade: string; // = modalidades.area
  limite: number; // 999 = ilimitado
}

export interface Plano {
  id: number;
  nome: string;
  preco: number;
  duracao_meses: number;
  regras_acesso: RegraAcesso[];
  is_plano_livre: boolean;
}

export interface Aluno {
  id: number;
  auth_id: string;
  estudio_id: string;
  nome_completo: string;
  email: string;
  telefone: string | null;
  data_nascimento: string | null;
  cpf: string | null;
  avatar_url: string | null;
  plano_id: number | null;
  status_pagamento: 'em_dia' | 'atrasado' | string;
  dias_atraso: number;
  ativo: boolean;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  complemento: string | null;
  contato_emergencia: string | null;
  metadata: Record<string, unknown>;
  planos?: Plano;
}

export interface Mensalidade {
  id: number;
  aluno_id: number;
  data_vencimento: string;
  data_pagamento: string | null;
  valor_pago: number | null;
  valor_cobranca: number | null;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado' | string;
  link_pagamento: string | null;
  asaas_payment_id: string | null;
  forma_pagamento: string | null;
}

export interface Aula {
  id: number;
  atividade: string;
  dia_semana: string | null;
  data_especifica: string | null;
  horario: string; // 'HH:mm:ss'
  capacidade: number;
  vagas_ocupadas: number;
  duracao_minutos: number;
  professores?: { nome: string } | null;
  modalidades?: { area: string } | null;
  presencas?: { aluno_id: number }[];
}
