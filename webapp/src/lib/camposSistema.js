// Campos protegidos: já existem como coluna real em `alunos` ou têm lógica
// hardcoded em outros pontos do sistema (geração de mensalidade, RLS,
// autenticação, troca de papel/tenant). Um `field_name` de campo dinâmico
// nunca pode colidir com esta lista — em nenhum estudio_id.
//
// Mantida separada de `alunosService.CAMPOS_ATUALIZAVEIS` de propósito:
// aquela lista é "o que o client pode atualizar" (grants), esta é
// "o que não pode ser reaproveitado como slug de campo dinâmico" (reserva
// de nome). São preocupações diferentes que hoje coincidem em conteúdo,
// mas podem divergir no futuro (ex.: 'metadata' é reservado aqui mas nunca
// vai estar em CAMPOS_ATUALIZAVEIS como campo direto).
export const CAMPOS_SISTEMA = [
  // colunas fixas de alunos
  'nome_completo', 'email', 'cpf', 'telefone', 'data_nascimento',
  'plano_id', 'data_inicio_plano', 'data_fim_plano',
  'modalidades_selecionadas', 'contato_emergencia',
  'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade',
  'link_anamnese', 'observacoes_medicas',
  // colunas de identidade/controle — nunca editáveis via form nenhum
  'id', 'estudio_id', 'auth_id', 'role', 'ativo', 'metadata',
  'created_at', 'updated_at',
];

// Regras de formato do slug em si (independente de colidir com CAMPOS_SISTEMA).
// snake_case, começa com letra, sem espaço/acento/maiúscula — evita chave
// jsonb inconsistente e problemas de charset em índices futuros.
const REGEX_FIELD_NAME = /^[a-z][a-z0-9_]{1,49}$/;

/**
 * Valida um field_name candidato a campo dinâmico.
 * Usada tanto no client (form) quanto no service (revalidação server-side) —
 * mesma função, duas chamadas, para não haver divergência de regra entre as camadas.
 *
 * @param {string} fieldName
 * @returns {{ valido: boolean, erro?: string }}
 */
export function validarFieldName(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return { valido: false, erro: 'Nome do campo é obrigatório.' };
  }

  const nome = fieldName.trim();

  if (!REGEX_FIELD_NAME.test(nome)) {
    return {
      valido: false,
      erro: 'Nome do campo deve começar com letra minúscula e conter apenas letras minúsculas, números e "_".',
    };
  }

  if (CAMPOS_SISTEMA.includes(nome)) {
    return {
      valido: false,
      erro: `"${nome}" é um campo reservado do sistema e não pode ser usado como campo customizado.`,
    };
  }

  return { valido: true };
}

/**
 * Valida um objeto `metadata` inteiro contra CAMPOS_SISTEMA — usada como
 * defesa extra no momento de gravar em alunos.metadata, para garantir que
 * nenhuma chave reservada entre por essa via (ex.: alguém tentando gravar
 * metadata: { role: 'admin' } para burlar CAMPOS_ATUALIZAVEIS).
 *
 * @param {Record<string, unknown>} metadata
 * @returns {Record<string, unknown>} metadata sem as chaves reservadas
 */
export function sanitizarMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([chave]) => !CAMPOS_SISTEMA.includes(chave))
  );
}