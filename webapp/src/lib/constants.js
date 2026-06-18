// src/lib/constants.js
// ─── Nexofy · Constantes Globais ─────────────────────────────────────────────
//
// REGRA: zero valores de cor hardcoded aqui.
// Cores de UI → tokens CSS via Tailwind (bg-primary, text-destructive, etc.)
// Cores de dados (gráficos, paleta de modalidades) → tokens HSL do design system.
// ─────────────────────────────────────────────────────────────────────────────

// ── REMOVIDO: CORES (hardcoded #FFD600, #2D2D2D, etc.)
// Use os tokens do design system diretamente nas classes Tailwind:
//   primary → bg-primary / text-primary
//   success → bg-success / text-success
//   warning → bg-warning / text-warning
//   muted   → bg-muted   / text-muted-foreground

export const STATUS_MENSALIDADE = {
  PAGO:     'pago',
  PENDENTE: 'pendente',
  ATRASADO: 'atrasado',
};

export const ROLES = {
  ADMIN:     'admin',
  PROFESSOR: 'professor',
  ALUNO:     'aluno',
  SUPER_ADMIN: 'super_admin',
};

export const DIAS_SEMANA = [
  { valor: 'segunda-feira', label: 'Segunda-feira', abrev: 'Seg' },
  { valor: 'terça-feira',   label: 'Terça-feira',   abrev: 'Ter' },
  { valor: 'quarta-feira',  label: 'Quarta-feira',  abrev: 'Qua' },
  { valor: 'quinta-feira',  label: 'Quinta-feira',  abrev: 'Qui' },
  { valor: 'sexta-feira',   label: 'Sexta-feira',   abrev: 'Sex' },
  { valor: 'sábado',        label: 'Sábado',        abrev: 'Sáb' },
  { valor: 'domingo',       label: 'Domingo',       abrev: 'Dom' },
];

export const PAGINACAO = {
  ITENS_POR_PAGINA:        20,
  ITENS_POR_PAGINA_MOBILE: 10,
};

export const FORMAS_PAGAMENTO = [
  { valor: 'pix',           label: 'Pix'               },
  { valor: 'credito',       label: 'Cartão de Crédito'  },
  { valor: 'debito',        label: 'Cartão de Débito'   },
  { valor: 'dinheiro',      label: 'Dinheiro'           },
  { valor: 'transferencia', label: 'Transferência'      },
];

export const TIPOS_AULA = [
  { valor: 'regular',      label: 'Aula Regular'      },
  { valor: 'plano_livre',  label: 'Plano Livre'       },
  { valor: 'experimental', label: 'Aula Experimental' },
  { valor: 'avulsa',       label: 'Aula Avulsa'       },
];

export const LIMITES = {
  NOME_MIN:              3,
  NOME_MAX:              100,
  SENHA_MIN:             8,
  CAPACIDADE_AULA_MIN:   1,
  CAPACIDADE_AULA_MAX:   50,
  VALOR_PLANO_MIN:       0,
  VALOR_PLANO_MAX:       10000,
};

export const MENSAGENS = {
  erro: {
    generico:            'Ocorreu um erro inesperado. Tente novamente.',
    semPermissao:        'Você não tem permissão para realizar esta ação.',
    naoAutenticado:      'Você precisa estar autenticado.',
    camposObrigatorios:  'Preencha todos os campos obrigatórios.',
    emailInvalido:       'Digite um e-mail válido.',
    senhaFraca:          'A senha deve ter no mínimo 8 caracteres.',
  },
  sucesso: {
    cadastrado: 'Cadastrado com sucesso!',
    atualizado: 'Atualizado com sucesso!',
    excluido:   'Excluído com sucesso!',
    salvo:      'Salvo com sucesso!',
  },
};

export const CONFIG_DATA = {
  FORMATO_BR:            'DD/MM/YYYY',
  FORMATO_ISO:           'YYYY-MM-DD',
  TIMEZONE:              'America/Sao_Paulo',
  DIA_VENCIMENTO_PADRAO: 10,
};

export const API_ENDPOINTS = {
  BASE_URL: import.meta.env.VITE_API_URL || '',
};

export const REGEX = {
  EMAIL:          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  TELEFONE:       /^\(\d{2}\)\s\d{4,5}-\d{4}$/,
  CPF:            /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  APENAS_NUMEROS: /^\d+$/,
};

export const LINKS = {
  // URL de suporte vinda do env — nunca hardcoded com domínio de tenant
  SUPORTE:       import.meta.env.VITE_SUPORTE_URL || 'mailto:suporte@nexofy.app',
  DOCUMENTACAO:  '/docs',
  TERMOS:        '/termos-de-uso',
  PRIVACIDADE:   '/politica-privacidade',
};

export const ICONES_STATUS = {
  ativo:     'CheckCircle',
  inativo:   'XCircle',
  pendente:  'Clock',
  pago:      'CheckCircle',
  atrasado:  'AlertCircle',
};

// ── Cores para gráficos (Recharts) ───────────────────────────────────────────
// Usam variáveis CSS para respeitar o tema light/dark.
// Recupere em tempo de execução com getComputedStyle quando necessário.
// Exemplo de uso em Recharts:
//   fill="hsl(var(--primary))"
//   fill="hsl(var(--success))"
export const CORES_GRAFICOS_TOKENS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--muted-foreground))',
];

// ── Paleta de cores para modalidades / tags ──────────────────────────────────
// Definida em tokens semânticos Tailwind — funciona em light e dark.
// Estrutura: { id, bg, text, border } → classes Tailwind completas.
export const PALETA_CORES = [
  { id: 'laranja',     bg: 'bg-orange-100 dark:bg-orange-900/30',   text: 'text-orange-700 dark:text-orange-300',  border: 'border-orange-300 dark:border-orange-700' },
  { id: 'roxo',        bg: 'bg-purple-100 dark:bg-purple-900/30',   text: 'text-purple-700 dark:text-purple-300',  border: 'border-purple-300 dark:border-purple-700' },
  { id: 'verde',       bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300',border: 'border-emerald-300 dark:border-emerald-700'},
  { id: 'azul',        bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300',      border: 'border-blue-300 dark:border-blue-700'     },
  { id: 'rosa',        bg: 'bg-pink-100 dark:bg-pink-900/30',       text: 'text-pink-700 dark:text-pink-300',      border: 'border-pink-300 dark:border-pink-700'     },
  { id: 'amarelo',     bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',    border: 'border-amber-300 dark:border-amber-700'   },
  { id: 'cinza',       bg: 'bg-muted',                               text: 'text-muted-foreground',                 border: 'border-border'                            },
  { id: 'primary',     bg: 'bg-primary-soft',                        text: 'text-primary',                          border: 'border-primary/40'                        },
];

export default {
  STATUS_MENSALIDADE,
  ROLES,
  DIAS_SEMANA,
  PAGINACAO,
  FORMAS_PAGAMENTO,
  TIPOS_AULA,
  LIMITES,
  MENSAGENS,
  CONFIG_DATA,
  API_ENDPOINTS,
  REGEX,
  LINKS,
  ICONES_STATUS,
  CORES_GRAFICOS_TOKENS,
  PALETA_CORES,
};