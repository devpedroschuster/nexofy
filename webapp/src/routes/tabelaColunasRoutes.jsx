import ConfiguracaoTabelaAlunos from '../pages/configuracoes/ConfiguracaoTabelaAlunos';
import ConfiguracaoTabelaFinanceiro from '../pages/configuracoes/ConfiguracaoTabelaFinanceiro';
import { RequireAdmin } from '../components/auth/RequireAdmin';

export const tabelaColunasRoutes = [
  {
    path: '/configuracoes/tabela-alunos',
    element: (
      <RequireAdmin>
        <ConfiguracaoTabelaAlunos />
      </RequireAdmin>
    ),
  },
  {
    path: '/configuracoes/tabela-financeiro',
    element: (
      <RequireAdmin>
        <ConfiguracaoTabelaFinanceiro />
      </RequireAdmin>
    ),
  },
];