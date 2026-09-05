export const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(valor) ? valor : 0);
};

/**
 * Formata uma data para exibição em pt-BR.
 * Aceita: string ISO "YYYY-MM-DD", string ISO com timestamp completo,
 * ou um objeto Date. Retorna '-' para valores ausentes/inválidos.
 *
 * @param {string|Date} data
 * @param {boolean} comHora   - inclui hora:minuto
 * @param {boolean} mesCurto  - mês por extenso abreviado (ex: "jan") em vez de "01"
 */
export const formatarData = (data, comHora = false, mesCurto = false) => {
  if (!data) return '-';

  const options = {
    day: '2-digit',
    month: mesCurto ? 'short' : '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  };
  if (comHora) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  const somenteData = typeof data === 'string' ? data.split('T')[0] : null;
  const ehDataPura = somenteData && /^\d{4}-\d{2}-\d{2}$/.test(somenteData);
  const dataSegura = ehDataPura ? `${somenteData}T12:00:00` : data;

  const dataObj = new Date(dataSegura);
  if (Number.isNaN(dataObj.getTime())) return '-';

  return new Intl.DateTimeFormat('pt-BR', options).format(dataObj);
};

/** Formata data + hora, ex: "15/01/2025, 14:30". Usa formatarData internamente. */
export const formatarDataHora = (data) => formatarData(data, true);

export const paraUTC = (ano, mes, dia = 1) => {
  return new Date(Date.UTC(ano, mes, dia)).toISOString().split('T')[0];
};

export const validarEmail = (email) => {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validarCPF = (cpf) => {
  if (typeof cpf !== 'string') return false;
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;

  let soma = 0;
  for (let i = 1; i <= 9; i++) soma += parseInt(n[i - 1], 10) * (11 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(n[9], 10)) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(n[i - 1], 10) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(n[10], 10)) return false;

  return true;
};

/**
 * Formata CPF progressivamente — funciona tanto para exibir um CPF
 * completo já salvo quanto como máscara de digitação em tempo real
 * (formata parcialmente conforme o usuário digita).
 */
export const formatarCPF = (cpf) => {
  if (!cpf) return '';
  const n = String(cpf).replace(/\D/g, '').slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
};

export const formatarTelefone = (telefone) => {
  if (!telefone) return '';
  const n = String(telefone).replace(/\D/g, '');
  if (n.length === 11) {
    return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
};

// Mesma regra já usada em alunoSchema.telefone (src/lib/validation.js):
// aceita 10 dígitos (fixo + DDD) ou 11 (celular + DDD), ignorando qualquer
// formatação/máscara já presente no valor.
export const validarTelefone = (telefone) => {
  if (typeof telefone !== 'string') return false;
  const digitos = telefone.replace(/\D/g, '');
  return digitos.length === 10 || digitos.length === 11;
};

/**
 * Calcula idade em anos completos a partir de uma data de nascimento
 * (string "YYYY-MM-DD" ou ISO completo). Retorna null para valor
 * ausente/inválido — quem chama decide o que fazer com "idade desconhecida"
 * (normalmente tratar como não-menor, já que data_nascimento é opcional).
 */
export const calcularIdade = (dataNascimento) => {
  if (!dataNascimento) return null;
  const somenteData = String(dataNascimento).split('T')[0];
  const nascimento = new Date(`${somenteData}T12:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;

  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversarioEsteAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversarioEsteAno) idade -= 1;

  return idade;
};

// PED-170: usado tanto na validação do cadastro (exigir consentimento do
// responsável legal) quanto no gate de campos sensíveis de saúde
// (anamnese/observações médicas) — mesma regra de corte (18 anos
// completos) em todos os pontos, pra não haver uma tela mais permissiva
// que outra pro mesmo aluno.
export const ehMenorDeIdade = (dataNascimento) => {
  const idade = calcularIdade(dataNascimento);
  return idade !== null && idade < 18;
};

export const coresStatus = {
  pago:     { bg: 'bg-success-soft', text: 'text-success' },
  pendente: { bg: 'bg-warning-soft', text: 'text-warning' },
  atrasado: { bg: 'bg-destructive-soft', text: 'text-destructive' },
  ativo:    { bg: 'bg-success-soft', text: 'text-success' },
  inativo:  { bg: 'bg-muted', text: 'text-muted-foreground' },
};