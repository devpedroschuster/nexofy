create or replace function public.substituir_repasses_mensalidade(
  p_estudio_id uuid,
  p_mensalidade_id bigint,
  p_ids_lote_remover uuid[],
  p_itens jsonb
)
returns setof repasses_lancamentos
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if not (
      eh_super_admin()
      or exists (
        select 1 from estudio_membros
        where user_id = auth.uid()
          and estudio_id = p_estudio_id
          and role = 'admin'
      )
    ) then
      raise exception 'Acesso negado: você não tem permissão para alterar repasses deste estúdio.';
    end if;
  end if;

  delete from repasses_lancamentos
  where mensalidade_id = p_mensalidade_id
    and estudio_id = p_estudio_id;

  if p_ids_lote_remover is not null and array_length(p_ids_lote_remover, 1) > 0 then
    delete from repasses_lancamentos
    where id = any(p_ids_lote_remover)
      and estudio_id = p_estudio_id;
  end if;

  return query
  insert into repasses_lancamentos (
    estudio_id, professor_id, aluno_id, mensalidade_id,
    tipo_aula, modalidade, valor, data_referencia
  )
  select
    (item->>'estudio_id')::uuid,
    (item->>'professor_id')::uuid,
    (item->>'aluno_id')::bigint,
    (item->>'mensalidade_id')::bigint,
    item->>'tipo_aula',
    item->>'modalidade',
    (item->>'valor')::numeric,
    (item->>'data_referencia')::date
  from jsonb_array_elements(p_itens) as item
  where p_estudio_id = (item->>'estudio_id')::uuid
    and p_mensalidade_id = (item->>'mensalidade_id')::bigint
  returning *;
end;
$$;

comment on function public.substituir_repasses_mensalidade(uuid, bigint, uuid[], jsonb) is
  'Substitui (delete+insert atômico) os repasses de uma mensalidade. Chamadas via service_role (gerar-repasses) pulam a checagem de admin — o caller já validou isso; chamadas via anon/authenticated exigem admin do estúdio.';

