import * as yup from 'yup';
import { validarFieldName } from './camposSistema';

// Segue o mesmo estilo de webapp/src/lib/validation.js (yup + .test custom
// para regras que não são só formato).
export const campoDinamicoSchema = yup.object().shape({
  field_name: yup
    .string()
    .trim()
    .required('O identificador do campo é obrigatório.')
    .test('field-name-valido', 'Identificador inválido.', function (value) {
      if (!value) return true; // required() já cobre o vazio
      const { valido, erro } = validarFieldName(value);
      return valido || this.createError({ message: erro });
    }),

  label: yup
    .string()
    .trim()
    .required('O rótulo exibido é obrigatório.')
    .max(80, 'O rótulo deve ter no máximo 80 caracteres.'),

  field_type: yup
    .string()
    .oneOf(['text', 'number', 'boolean', 'select', 'file'], 'Tipo de campo inválido.')
    .required('O tipo do campo é obrigatório.'),

  opcoes: yup
    .array()
    .of(yup.string().trim().min(1))
    .nullable()
    .when('field_type', {
      is: 'select',
      then: (schema) =>
        schema
          .min(1, 'Adicione ao menos uma opção para um campo do tipo seleção.')
          .required('Adicione ao menos uma opção para um campo do tipo seleção.'),
      otherwise: (schema) => schema.nullable().optional(),
    }),

  is_required: yup.boolean().default(false),
  is_active: yup.boolean().default(true),
  display_order: yup.number().integer().min(0).default(0),
});