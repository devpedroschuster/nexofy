// routes/tabelaColunasRoutes.jsx
//
// Snippet de referência para registrar as duas rotas de configuração.
// Ajustar para o formato real de rotas já usado no projeto (este exemplo
// assume react-router-dom v6 com createBrowserRouter/rotas aninhadas —
// trocar pelo padrão real, ex. se as rotas de /configuracoes/* já
// existem centralizadas em algum AppRoutes.jsx).
//
// Ponto de atenção: a RLS já bloqueia escrita para quem não é admin do
// estúdio (ver migration_tabela_colunas_config.sql, policies de
// insert/update/delete). Mesmo assim, a rota deveria ficar atrás do
// mesmo guard de rota admin-only já usado em outras telas de
// /configuracoes/* (ex. ConfiguracoesEspacos) — defesa em profundidade,
// e também para não expor a tela de configuração (mesmo que inofensiva
// em leitura) para quem não deveria vê-la.

import ConfiguracaoTabelaAlunos from '../pages/configuracoes/ConfiguracaoTabelaAlunos';
import ConfiguracaoTabelaFinanceiro from '../pages/configuracoes/ConfiguracaoTabelaFinanceiro';
// import { RequireAdmin } from '../components/auth/RequireAdmin'; // guard já usado em outras rotas /configuracoes/*

export const tabelaColunasRoutes = [
  {
    path: '/configuracoes/tabela-alunos',
    element: <ConfiguracaoTabelaAlunos />, // envolver com <RequireAdmin> se existir esse padrão
  },
  {
    path: '/configuracoes/tabela-financeiro',
    element: <ConfiguracaoTabelaFinanceiro />, // envolver com <RequireAdmin> se existir esse padrão
  },
];