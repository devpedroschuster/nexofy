-- PED-296: RLS de SELECT em alunos/agenda/repasses_lancamentos/modalidades
-- concedia leitura do estúdio inteiro ao papel professor. A condição
-- "estudio_id = estudio_id_atual()" já libera acesso a qualquer membro do
-- estúdio (independente do role), tornando irrelevantes as condições mais
-- específicas (professor_id/modalidade_id) que vinham depois no OR.
--
-- O client já restringe corretamente para o papel professor (mesma lógica
-- replicada aqui):
--   - webapp/src/pages/Professor/ProfessorAlunos.jsx (carregarAlunos)
--   - mobile-pro/src/features/alunos.ts (useMeusAlunos)
--   - webapp/src/services/gradeService.js (listarGrade, ramo professor)
--   - mobile-pro/src/features/agenda.ts (useAulasDoDia, professorId != null)
--   - webapp/src/services/repasseService.js (listarRepassesProfessor)
--   - mobile-pro/src/features/financeiro.ts
-- mas a RLS não replicava essa restrição — a filtragem existia só nessa
-- camada do client, sem defesa em profundidade no banco.
--
-- Fix: a condição "estúdio inteiro" agora só vale quando
-- eh_admin_do_estudio_atual(); o papel professor passa a depender das
-- condições restritas por professor_id/modalidade_id (agenda,
-- repasses_lancamentos, modalidades) ou modalidades_selecionadas (alunos) —
-- sem alterar nenhuma das condições já restritas que já existiam.

-- ============================================================================
-- agenda: SELECT
-- ============================================================================
drop policy if exists tenant_select on public.agenda;
create policy tenant_select on public.agenda
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or eh_super_admin()
  or (professor_id in (
    select professores.id from professores
    where professores.auth_id = auth.uid()
  ))
  or (modalidade_id in (
    select modalidades.id from modalidades
    where modalidades.professor_id in (
      select professores.id from professores where professores.auth_id = auth.uid()
    )
  ))
);

-- ============================================================================
-- repasses_lancamentos: SELECT
-- ============================================================================
drop policy if exists tenant_select on public.repasses_lancamentos;
create policy tenant_select on public.repasses_lancamentos
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or eh_super_admin()
  or (professor_id in (
    select professores.id from professores where professores.auth_id = auth.uid()
  ))
);

-- ============================================================================
-- modalidades: SELECT — mesma correção estrutural (risco menor, só nomes de
-- modalidade), citada como follow-up no mesmo achado.
-- ============================================================================
drop policy if exists tenant_select on public.modalidades;
create policy tenant_select on public.modalidades
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or eh_super_admin()
  or (professor_id in (
    select professores.id from professores where professores.auth_id = auth.uid()
  ))
  or (id in (
    select agenda.modalidade_id from agenda
    where agenda.modalidade_id is not null
      and agenda.professor_id in (
        select professores.id from professores where professores.auth_id = auth.uid()
      )
  ))
);

-- ============================================================================
-- alunos: SELECT — não existia nenhuma condição por professor antes (só
-- admin/super_admin/próprio aluno). Nova condição espelha exatamente
-- carregarAlunos() (webapp) / useMeusAlunos() (mobile-pro): aluno
-- matriculado numa modalidade que o professor é dono OU numa modalidade de
-- uma aula que ele dá.
-- ============================================================================
drop policy if exists tenant_select on public.alunos;
create policy tenant_select on public.alunos
as permissive for select to public
using (
  (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  or eh_super_admin()
  or (auth_id = auth.uid())
  or (
    modalidades_selecionadas && (
      select array(
        select m.id from modalidades m
        where m.professor_id in (
          select p.id from professores p where p.auth_id = auth.uid()
        )
        union
        select a.modalidade_id from agenda a
        where a.modalidade_id is not null
          and a.professor_id in (
            select p.id from professores p where p.auth_id = auth.uid()
          )
      )
    )
  )
);
