-- PED-247: RLS de INSERT em alunos não validava role, só o UPDATE validava
-- (no_self_promotion + trg_prevent_role_change). Um admin comum podia, via
-- DevTools/REST direto, criar um aluno com role='admin' (contornando a
-- sanitização client-side de NovoAluno.jsx) e, se também setasse auth_id
-- para outra conta, essa conta passaria a satisfazer role_aluno_atual() =
-- 'admin' na sua própria futura auto-atualização — contornando
-- no_self_promotion numa segunda etapa.
--
-- Fix: tenant_insert agora também exige role = 'aluno' e auth_id IS NULL
-- (o fluxo de criação legítimo — webapp/src/pages/NovoAluno.jsx — nunca
-- envia role diferente de 'aluno' nem auth_id no INSERT; o vínculo de
-- auth_id acontece depois, via UPDATE ou pela Edge Function de matrícula),
-- a menos que eh_super_admin() (mesmo padrão condicional de no_self_promotion,
-- mas usando eh_super_admin() em vez de role_aluno_atual() já que não há
-- linha própria em alunos ainda no momento do INSERT).

drop policy if exists tenant_insert on public.alunos;
create policy tenant_insert on public.alunos
as permissive for insert to public
with check (
  estudio_id = estudio_id_atual()
  and eh_admin_do_estudio_atual()
  and (role = 'aluno' or eh_super_admin())
  and (auth_id is null or eh_super_admin())
);
