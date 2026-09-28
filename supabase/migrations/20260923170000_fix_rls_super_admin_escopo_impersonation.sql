-- PED-299: RLS não isola dados por tenant para super_admin — a maioria das
-- tabelas tenant-scoped tem um branch incondicional "OR eh_super_admin()"
-- nas policies, sem nenhuma referência a estudio_id_atual()/override de
-- impersonation ativo. Ou seja: QUALQUER query de um super_admin nessas
-- tabelas retorna linhas de TODOS os estúdios no nível do banco — o
-- isolamento durante impersonation depende só do filtro client-side
-- (estudioAtivo?.id em cada query do front-end).
--
-- Fix: o branch de super_admin passa a exigir um override de impersonation
-- ativo apontando para o MESMO estudio_id da linha
-- (eh_super_admin() AND estudio_id = estudio_ativo_via_override()), em vez
-- de um bypass total. Nenhuma outra condição das policies foi alterada.
--
-- Exceções deliberadas (fora do escopo desta migration):
--   - estudios (todas as policies) e alunos.tenant_select (SELECT): o
--     painel Super Admin usa `.from('estudios')`/`.from('alunos')` SEM
--     filtro de estudio para contagens globais de KPI
--     (superAdminService.metricasGlobais) e para alterar status/trial de
--     QUALQUER estúdio (alterarStatusEstudio/removerTrialEstudio) — fora de
--     um contexto de impersonation. Restringir essas duas tabelas quebraria
--     esses recursos já em produção. Ver comentário no Linear (PED-299)
--     recomendando migrar esses acessos para RPCs SECURITY DEFINER
--     dedicadas (mesmo padrão de receita_total_paga()), o que permitiria
--     endurecer a RLS dessas duas tabelas depois.
--   - estudio_membros.self_select e audit_log.super_admin_le_audit_log:
--     visibilidade global intencional (gestão de vínculos entre estúdios e
--     trilha de auditoria do sistema, não dado operacional por tenant).
--   - tabela_colunas_config: já corretamente escopado (eh_super_admin() já
--     vem AND-ado com estudio_id = estudio_id_atual(), não é um branch OR
--     separado) — não é uma instância do bug.

-- ============================================================================
-- agenda / agenda_excecoes / agenda_fixa
-- ============================================================================
drop policy if exists tenant_select on public.agenda;
create policy tenant_select on public.agenda
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or (professor_id in (select professores.id from professores where professores.auth_id = auth.uid()))
  or (modalidade_id in (
    select modalidades.id from modalidades
    where modalidades.professor_id in (select professores.id from professores where professores.auth_id = auth.uid())
  ))
);

drop policy if exists tenant_select on public.agenda_excecoes;
create policy tenant_select on public.agenda_excecoes
as permissive for select to public
using (
  (aula_id in (select agenda.id from agenda where agenda.estudio_id = estudio_id_atual()))
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists agenda_fixa_select_estudio on public.agenda_fixa;
create policy agenda_fixa_select_estudio on public.agenda_fixa
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

-- ============================================================================
-- campos_dinamicos (SELECT/INSERT/UPDATE/DELETE)
-- ============================================================================
drop policy if exists select_campos_dinamicos on public.campos_dinamicos;
create policy select_campos_dinamicos on public.campos_dinamicos
as permissive for select to public
using (
  estudio_id = meu_estudio_id()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists insert_campos_dinamicos on public.campos_dinamicos;
create policy insert_campos_dinamicos on public.campos_dinamicos
as permissive for insert to public
with check (
  (estudio_id = meu_estudio_id() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists update_campos_dinamicos on public.campos_dinamicos;
create policy update_campos_dinamicos on public.campos_dinamicos
as permissive for update to public
using (
  (estudio_id = meu_estudio_id() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
)
with check (
  (estudio_id = meu_estudio_id() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists delete_campos_dinamicos on public.campos_dinamicos;
create policy delete_campos_dinamicos on public.campos_dinamicos
as permissive for delete to public
using (
  (estudio_id = meu_estudio_id() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

-- ============================================================================
-- configuracoes_repasse / consentimentos_* / despesas / estudio_dados_asaas
-- / feriados / planos (SELECT, mesmo formato simples)
-- ============================================================================
drop policy if exists tenant_select on public.configuracoes_repasse;
create policy tenant_select on public.configuracoes_repasse
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.consentimentos_dados_sensiveis_saude;
create policy tenant_select on public.consentimentos_dados_sensiveis_saude
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.consentimentos_responsavel_legal;
create policy tenant_select on public.consentimentos_responsavel_legal
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.despesas;
create policy tenant_select on public.despesas
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.estudio_dados_asaas;
create policy tenant_select on public.estudio_dados_asaas
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.feriados;
create policy tenant_select on public.feriados
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists tenant_select on public.planos;
create policy tenant_select on public.planos
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

-- ============================================================================
-- professores / mensalidades / historico_planos (SELECT + branch "próprio")
-- ============================================================================
drop policy if exists tenant_select on public.professores;
create policy tenant_select on public.professores
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or auth_id = auth.uid()
);

drop policy if exists tenant_select on public.mensalidades;
create policy tenant_select on public.mensalidades
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or aluno_id in (select alunos.id from alunos where alunos.auth_id = auth.uid())
);

drop policy if exists tenant_select on public.historico_planos;
create policy tenant_select on public.historico_planos
as permissive for select to public
using (
  estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or aluno_id in (select alunos.id from alunos where alunos.auth_id = auth.uid())
);

-- ============================================================================
-- fechamento_comissoes / modalidades / repasses_lancamentos (SELECT com
-- branch de professor)
-- ============================================================================
drop policy if exists tenant_select on public.fechamento_comissoes;
create policy tenant_select on public.fechamento_comissoes
as permissive for select to public
using (
  professor_id in (select professores.id from professores where professores.estudio_id = estudio_id_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or professor_id in (select professores.id from professores where professores.auth_id = auth.uid())
);

drop policy if exists tenant_select on public.modalidades;
create policy tenant_select on public.modalidades
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or (professor_id in (select professores.id from professores where professores.auth_id = auth.uid()))
  or (id in (
    select agenda.modalidade_id from agenda
    where agenda.modalidade_id is not null
      and agenda.professor_id in (select professores.id from professores where professores.auth_id = auth.uid())
  ))
);

drop policy if exists tenant_select on public.repasses_lancamentos;
create policy tenant_select on public.repasses_lancamentos
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
  or (professor_id in (select professores.id from professores where professores.auth_id = auth.uid()))
);

-- ============================================================================
-- leads (SELECT/INSERT/UPDATE/DELETE — padrão antigo, EXISTS inline)
-- ============================================================================
drop policy if exists leads_select_estudio on public.leads;
create policy leads_select_estudio on public.leads
as permissive for select to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = any (array['admin','professor'])))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists leads_insert_estudio on public.leads;
create policy leads_insert_estudio on public.leads
as permissive for insert to public
with check (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = any (array['admin','professor'])))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists leads_update_estudio on public.leads;
create policy leads_update_estudio on public.leads
as permissive for update to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = any (array['admin','professor'])))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
)
with check (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = any (array['admin','professor'])))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists leads_delete_estudio on public.leads;
create policy leads_delete_estudio on public.leads
as permissive for delete to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = any (array['admin','professor'])))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

-- ============================================================================
-- presencas (SELECT/INSERT/UPDATE/DELETE — padrão antigo, EXISTS inline;
-- INSERT/UPDATE/DELETE já têm o branch de professor da PED-304, preservado)
-- ============================================================================
drop policy if exists presenca_select_estudio on public.presencas;
create policy presenca_select_estudio on public.presencas
as permissive for select to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid()))
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists presenca_insert_estudio on public.presencas;
create policy presenca_insert_estudio on public.presencas
as permissive for insert to public
with check (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'admin'))
  or (
    estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'professor')
    and exists (
      select 1 from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id and a.estudio_id = presencas.estudio_id and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists presenca_update_estudio on public.presencas;
create policy presenca_update_estudio on public.presencas
as permissive for update to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'admin'))
  or (
    estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'professor')
    and exists (
      select 1 from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id and a.estudio_id = presencas.estudio_id and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
)
with check (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'admin'))
  or (
    estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'professor')
    and exists (
      select 1 from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id and a.estudio_id = presencas.estudio_id and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

drop policy if exists presenca_delete_estudio on public.presencas;
create policy presenca_delete_estudio on public.presencas
as permissive for delete to public
using (
  (estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'admin'))
  or (
    estudio_id in (select em.estudio_id from estudio_membros em where em.user_id = auth.uid() and em.role = 'professor')
    and exists (
      select 1 from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id and a.estudio_id = presencas.estudio_id and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or (
    exists (select 1 from estudio_membros em where em.user_id = auth.uid() and em.role = 'super_admin')
    and estudio_id = estudio_ativo_via_override()
  )
);

-- ============================================================================
-- solicitacoes_titular (SELECT/UPDATE — LGPD, alta sensibilidade)
-- ============================================================================
drop policy if exists aluno_ve_propria_solicitacao on public.solicitacoes_titular;
create policy aluno_ve_propria_solicitacao on public.solicitacoes_titular
as permissive for select to public
using (
  exists (select 1 from alunos a where a.id = solicitacoes_titular.aluno_id and a.auth_id = auth.uid())
  or estudio_id = estudio_id_atual()
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);

drop policy if exists admin_atende_solicitacao on public.solicitacoes_titular;
create policy admin_atende_solicitacao on public.solicitacoes_titular
as permissive for update to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
)
with check (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or (eh_super_admin() and estudio_id = estudio_ativo_via_override())
);
