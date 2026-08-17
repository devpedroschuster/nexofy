// Rotas de configuração de colunas. O RLS bloqueia escrita para
// não-admins (ver migration_tabela_colunas_config.sql), mas isso NÃO
// substitui o guard de rota: sem ele, qualquer usuário autenticado
// consegue navegar e LER a tela de configuração (mesmo que não consiga
// salvar nada) — falha de defesa em profundidade corrigida abaixo.
//
// Ajustar o caminho de import de RequireAdmin para o padrão real do
// projeto, se divergir do usado em outras rotas /configuracoes/*.

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