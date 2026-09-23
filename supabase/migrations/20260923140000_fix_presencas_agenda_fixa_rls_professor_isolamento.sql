-- PED-304: RLS de presencas/agenda_fixa não restringia escrita por professor
-- às próprias aulas — qualquer professor do estúdio podia inserir/atualizar/
-- apagar presença (e matrícula fixa) em aula de outro professor, pois as
-- policies só checavam estudio_id + role, sem checar o dono da aula.
--
-- Fix: para o papel 'professor', exige que a aula referenciada (via
-- agenda.professor_id ou, na ausência dele, modalidades.professor_id)
-- pertença ao professores.auth_id do usuário autenticado. admin/super_admin
-- continuam com acesso irrestrito ao estúdio, sem mudança de comportamento.

-- ============================================================================
-- presencas: INSERT / UPDATE / DELETE
-- ============================================================================

drop policy if exists presenca_insert_estudio on public.presencas;
create policy presenca_insert_estudio on public.presencas
as permissive for insert to public
with check (
  (estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'admin'
  ))
  or (
    estudio_id in (
      select em.estudio_id from estudio_membros em
      where em.user_id = auth.uid() and em.role = 'professor'
    )
    and exists (
      select 1
      from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id
        and a.estudio_id = presencas.estudio_id
        and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or exists (
    select 1 from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'super_admin'
  )
);

drop policy if exists presenca_update_estudio on public.presencas;
create policy presenca_update_estudio on public.presencas
as permissive for update to public
using (
  (estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'admin'
  ))
  or (
    estudio_id in (
      select em.estudio_id from estudio_membros em
      where em.user_id = auth.uid() and em.role = 'professor'
    )
    and exists (
      select 1
      from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id
        and a.estudio_id = presencas.estudio_id
        and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or exists (
    select 1 from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'super_admin'
  )
)
with check (
  (estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'admin'
  ))
  or (
    estudio_id in (
      select em.estudio_id from estudio_membros em
      where em.user_id = auth.uid() and em.role = 'professor'
    )
    and exists (
      select 1
      from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id
        and a.estudio_id = presencas.estudio_id
        and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or exists (
    select 1 from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'super_admin'
  )
);

drop policy if exists presenca_delete_estudio on public.presencas;
create policy presenca_delete_estudio on public.presencas
as permissive for delete to public
using (
  (estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'admin'
  ))
  or (
    estudio_id in (
      select em.estudio_id from estudio_membros em
      where em.user_id = auth.uid() and em.role = 'professor'
    )
    and exists (
      select 1
      from agenda a
      left join modalidades m on m.id = a.modalidade_id
      join professores p on p.auth_id = auth.uid()
      where a.id = presencas.aula_id
        and a.estudio_id = presencas.estudio_id
        and (a.professor_id = p.id or m.professor_id = p.id)
    )
  )
  or exists (
    select 1 from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'super_admin'
  )
);

-- ============================================================================
-- agenda_fixa: mesma classe de bug (policy ALL concedia escrita ao estúdio
-- inteiro via meu_estudio_id()/estudio_id_atual(), sem checar role nem dono
-- da aula) — evidência adicional documentada no mesmo achado (PED-304).
-- Leitura continua ampla (qualquer membro do estúdio já podia ler, isso não
-- muda); só escrita (INSERT/UPDATE/DELETE) passa a exigir dono da aula para
-- o papel professor.
-- ============================================================================

drop policy if exists "agenda_fixa: isolamento por estúdio" on public.agenda_fixa;

create policy agenda_fixa_select_estudio on public.agenda_fixa
as permissive for select to public
using (estudio_id = estudio_id_atual() or eh_super_admin());

create policy agenda_fixa_admin_write on public.agenda_fixa
as permissive for all to public
using (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
with check (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual());

create policy agenda_fixa_professor_write on public.agenda_fixa
as permissive for all to public
using (
  estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'professor'
  )
  and exists (
    select 1
    from agenda a
    left join modalidades m on m.id = a.modalidade_id
    join professores p on p.auth_id = auth.uid()
    where a.id = agenda_fixa.aula_id
      and a.estudio_id = agenda_fixa.estudio_id
      and (a.professor_id = p.id or m.professor_id = p.id)
  )
)
with check (
  estudio_id in (
    select em.estudio_id from estudio_membros em
    where em.user_id = auth.uid() and em.role = 'professor'
  )
  and exists (
    select 1
    from agenda a
    left join modalidades m on m.id = a.modalidade_id
    join professores p on p.auth_id = auth.uid()
    where a.id = agenda_fixa.aula_id
      and a.estudio_id = agenda_fixa.estudio_id
      and (a.professor_id = p.id or m.professor_id = p.id)
  )
);
