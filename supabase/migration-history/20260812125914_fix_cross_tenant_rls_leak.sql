-- Remove policies legadas "acesso total para autenticados" que anulavam
-- o isolamento multi-tenant (permissive OR com as policies tenant_*).
drop policy if exists "Acesso total para autenticados" on public.agenda;
drop policy if exists "Acesso total para autenticados" on public.alunos;
drop policy if exists "Acesso total para autenticados" on public.despesas;
drop policy if exists "Permitir tudo para autenticados - Despesas" on public.despesas;
drop policy if exists "Acesso total para autenticados" on public.feriados;
drop policy if exists "Acesso total para autenticados" on public.planos;
drop policy if exists "Acesso total para autenticados" on public.mensalidades;
drop policy if exists "Permitir gestão de mensalidades para autenticados" on public.mensalidades;
drop policy if exists "Permitir gestão de histórico para autenticados" on public.historico_planos;
drop policy if exists "Permitir inserção e update para autenticados" on public.historico_planos;
drop policy if exists "repasses_admin_all" on public.repasses_lancamentos;
drop policy if exists "config_repasse_select_auth" on public.configuracoes_repasse;
drop policy if exists "config_repasse_update_admin" on public.configuracoes_repasse;
