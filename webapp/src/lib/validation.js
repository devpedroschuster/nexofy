import * as yup from 'yup';
import { validarCPF } from '../lib/utils';

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
});