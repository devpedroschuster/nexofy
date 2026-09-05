import * as yup from 'yup';
import { validarCPF, ehMenorDeIdade } from '../lib/utils';

export const alunoSchema = yup.object().shape({
  nome_completo: yup
    .string()
    .trim()
    .required('O nome completo é obrigatório.')
    .max(150, 'O nome completo deve ter no máximo 150 caracteres.'),

  email: yup
    .string()
    .trim()
    .lowercase()
    .email('Insira um e-mail válido.')
    .required('O e-mail é obrigatório.')
    .max(255, 'O e-mail deve ter no máximo 255 caracteres.'),

  cpf: yup
    .string()
    .nullable()
    .optional()
    .test('cpf-valido', 'CPF inválido. Verifique os dígitos.', (value) => {
      if (!value) return true;
      return validarCPF(value);
    }),

  // IMPORTANTE: este campo nunca deve ser confiado isoladamente para autorização.
  // O backend (RLS / Edge Function) DEVE revalidar quem tem permissão de criar
  // um registro com role 'admin' — este schema só garante o formato do valor,
  // não a permissão de quem está enviando.
  role: yup
    .string()
    .oneOf(['aluno', 'admin'], 'Papel inválido.')
    .default('aluno'),

  plano_id: yup.string().nullable().optional(),

  data_nascimento: yup
    .string()
    .nullable()
    .optional()
    .test('data-valida', 'Data de nascimento inválida.', (value) => {
      if (!value) return true;
      const data = new Date(value);
      if (Number.isNaN(data.getTime())) return false;
      const hoje = new Date();
      const idadeMinima = new Date(hoje.getFullYear() - 120, hoje.getMonth(), hoje.getDate());
      return data <= hoje && data >= idadeMinima;
    }),

  telefone: yup
    .string()
    .nullable()
    .optional()
    .test('telefone-valido', 'Telefone inválido.', (value) => {
      if (!value) return true;
      const digitos = value.replace(/\D/g, '');
      return digitos.length === 10 || digitos.length === 11;
    }),

  cep: yup
    .string()
    .nullable()
    .optional()
    .test('cep-valido', 'CEP inválido.', (value) => {
      if (!value) return true;
      return value.replace(/\D/g, '').length === 8;
    }),

  rua: yup.string().trim().max(200).nullable().optional(),
  numero: yup.string().trim().max(20).nullable().optional(),
  bairro: yup.string().trim().max(100).nullable().optional(),

  // PED-170 (LGPD art. 14): aluno menor de 18 anos exige identificação e
  // consentimento do responsável legal antes de liberar o cadastro
  // completo. Estes 4 campos não são colunas de `alunos` — são
  // persistidos à parte, em `consentimentos_responsavel_legal` (registro
  // append-only, mesmo racional de prova de consentimento já usado em
  // `consentimentos`), então o schema aqui só garante que o operador não
  // consiga avançar/salvar sem preenchê-los quando aplicável.
  responsavel_legal_nome: yup
    .string()
    .trim()
    .when('data_nascimento', {
      is: (valor) => ehMenorDeIdade(valor),
      then: (schema) => schema
        .required('Nome do responsável legal é obrigatório para alunos menores de 18 anos.')
        .max(150, 'O nome do responsável deve ter no máximo 150 caracteres.'),
      otherwise: (schema) => schema.nullable().optional(),
    }),

  responsavel_legal_cpf: yup
    .string()
    .when('data_nascimento', {
      is: (valor) => ehMenorDeIdade(valor),
      then: (schema) => schema
        .required('CPF do responsável legal é obrigatório para alunos menores de 18 anos.')
        .test('cpf-responsavel-valido', 'CPF do responsável inválido. Verifique os dígitos.', (value) => (
          !!value && validarCPF(value)
        )),
      otherwise: (schema) => schema.nullable().optional(),
    }),

  responsavel_legal_parentesco: yup
    .string()
    .when('data_nascimento', {
      is: (valor) => ehMenorDeIdade(valor),
      then: (schema) => schema
        .oneOf(['mae', 'pai', 'tutor_legal', 'outro'], 'Selecione o parentesco do responsável legal.')
        .required('Selecione o parentesco do responsável legal.'),
      otherwise: (schema) => schema.nullable().optional(),
    }),

  consentimento_responsavel: yup
    .boolean()
    .when('data_nascimento', {
      is: (valor) => ehMenorDeIdade(valor),
      then: (schema) => schema
        .oneOf([true], 'É necessário confirmar o consentimento do responsável legal.')
        .required('É necessário confirmar o consentimento do responsável legal.'),
      otherwise: (schema) => schema.nullable().optional(),
    }),
});