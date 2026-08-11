// webapp/src/lib/camposDinamicosValidation.js
import * as yup from 'yup';

/**
 * Monta um yup.object() para o campo `metadata` de aluno, a partir do
 * catálogo de campos dinâmicos ativos daquele estúdio.
 *
 * IMPORTANTE (bug já visto no projeto): cada campo aqui gera erro sob o
 * path `metadata.<field_name>`, nunca path vazio (`errors['']`) — path
 * vazio faz a mensagem de erro ficar invisível na UI, porque nenhum
 * componente sabe em qual campo exibi-la. Como este schema é aninhado
 * dentro de `metadata` via yup.object().shape(), o path já sai correto
 * automaticamente; não precisa (e não deve) usar validação cross-field
 * solta que escreva na raiz.
 *
 * @param {Array<{ field_name: string, label: string, field_type: string,
 *                  opcoes?: string[], is_required?: boolean }>} campos
 * @returns {yup.ObjectSchema}
 */
export function construirSchemaMetadata(campos = []) {
  const shape = {};

  for (const campo of campos) {
    let campoSchema;

    switch (campo.field_type) {
      case 'number':
        campoSchema = yup
          .number()
          .typeError(`${campo.label} deve ser um número.`)
          .nullable();
        break;

      case 'boolean':
        campoSchema = yup.boolean().nullable();
        break;

      case 'select':
        campoSchema = yup
          .string()
          .nullable()
          .oneOf(
            [...(campo.opcoes ?? []), null, undefined, ''],
            `Selecione uma opção válida para ${campo.label}.`
          );
        break;

      case 'file':
        // Validação de arquivo em si (tamanho/tipo) fica fora de escopo aqui
        // — este item cobre o catálogo de campos, não o módulo de upload.
        campoSchema = yup.mixed().nullable();
        break;

      case 'text':
      default:
        campoSchema = yup.string().trim().nullable();
        break;
    }

    if (campo.is_required) {
      // .required() do yup trata '' e null como ausente; para boolean,
      // exige explicitamente true ou false (não deixa undefined passar).
      campoSchema = campo.field_type === 'boolean'
        ? campoSchema.required(`${campo.label} é obrigatório.`).typeError(`${campo.label} é obrigatório.`)
        : campoSchema.required(`${campo.label} é obrigatório.`);
    }

    shape[campo.field_name] = campoSchema;
  }

  // noUnknown: false — de propósito. Um campo desativado recentemente pode
  // ainda ter valor gravado no metadata de alunos antigos; não queremos que
  // a validação rejeite o objeto inteiro por causa de uma chave "extra" que
  // já não está no catálogo ativo.
  return yup.object().shape(shape);
}

/**
 * Combina um schema fixo (ex.: alunoSchema) com o schema dinâmico de
 * metadata, produzindo um schema único para uso no yupResolver do
 * react-hook-form.
 *
 * @param {yup.ObjectSchema} schemaFixo
 * @param {Array} camposDinamicos
 * @returns {yup.ObjectSchema}
 */
export function combinarComCamposDinamicos(schemaFixo, camposDinamicos = []) {
  return schemaFixo.shape({
    metadata: construirSchemaMetadata(camposDinamicos),
  });
}