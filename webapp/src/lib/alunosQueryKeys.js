export const alunosKeys = {
  // Lista paginada (Alunos.jsx / useAlunos.js)
  lista: (estudioId, filtros, pagina) => ['alunos', estudioId, filtros, pagina],
  listaTodas: (estudioId) => ['alunos', estudioId],

  // Perfil completo (PerfilAluno.jsx)
  perfil: (alunoId, estudioId) => ['aluno', alunoId, estudioId],
  planos: (alunoId, estudioId) => ['aluno-planos', alunoId, estudioId],
  frequencia: (alunoId, estudioId) => ['aluno-frequencia', alunoId, estudioId],

  // Aniversariantes
  aniversariantes: (estudioId) => ['alunos', estudioId, 'aniversariantes'],

  // Área do aluno (self-service)
  meuPerfil: () => ['meu-perfil'],
  minhasMensalidades: (alunoId) => ['minhas-mensalidades', alunoId],
  presencasMes: (alunoId) => ['presencas-mes', alunoId],
  agendaDoDia: (diaAtivo, estudioId) => ['agenda', diaAtivo, estudioId],
  feriadosSemana: (estudioId) => ['feriados-semana', estudioId],

  // Domínios relacionados que também precisam refresh após criar/editar aluno
  professores: () => ['professores'],
  presencas: () => ['presencas'],
};