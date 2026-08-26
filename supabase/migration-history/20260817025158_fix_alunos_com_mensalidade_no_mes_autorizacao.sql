-- VULNERABILIDADE: função não tinha NENHUMA checagem de autorização e
-- estava com EXECUTE liberado para 'anon' — qualquer pessoa sem login
-- conseguia listar aluno_id de QUALQUER estúdio passando p_estudio_id
-- arbitrário. Corrige exigindo que o caller seja membro (qualquer role)
-- ou super_admin do estúdio consultado, e restringe o EXECUTE.

create or replace function alunos_com_mensalidade_no_mes(p_estudio_id uuid, p_data_referencia date)
returns table(aluno_id bigint)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  if not (
    eh_super_admin()
    or exists (
      select 1 from estudio_membros
      where user_id = auth.uid()
        and estudio_id = p_estudio_id
    )
  ) then
    raise exception 'Acesso negado: você não pertence a este estúdio.' using errcode = '42501';
  end if;

  return query
  select distinct m.aluno_id
  from mensalidades m
  where m.estudio_id = p_estudio_id
    and date_trunc('month', m.data_vencimento) = date_trunc('month', p_data_referencia);
end;
$$;

revoke execute on function alunos_com_mensalidade_no_mes(uuid, date) from public;
revoke execute on function alunos_com_mensalidade_no_mes(uuid, date) from anon;
grant execute on function alunos_com_mensalidade_no_mes(uuid, date) to authenticated;
