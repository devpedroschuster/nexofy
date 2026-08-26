-- BUG CRÍTICO PRÉ-EXISTENTE: esta função checava auth.uid() pertencer a
-- estudio_membros(p_estudio_id), mas é chamada por gerar-mensalidades via
-- service_role (sem JWT de usuário) — auth.uid() é NULL nesse contexto,
-- então a checagem SEMPRE falhava com 42501 assim que houvesse pelo menos
-- 1 aluno (antes disso a função nunca era alcançada, por isso passava
-- despercebido: gerar-mensalidades sempre retornava cedo com "nenhum
-- aluno ativo" em qualquer teste anterior).
--
-- Fix: chamadas via service_role (edge function já validou admin antes de
-- chegar aqui) pulam a checagem. Chamadas via anon/authenticated (uso
-- direto, fora de uma edge function confiável) continuam exigindo
-- super_admin ou membro do estúdio.
create or replace function public.alunos_com_mensalidade_no_mes(
  p_estudio_id uuid,
  p_data_referencia date
)
returns table (aluno_id bigint)
language plpgsql
as $$
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  if auth.role() <> 'service_role' then
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
  end if;

  return query
  select distinct m.aluno_id
  from mensalidades m
  where m.estudio_id = p_estudio_id
    and m.data_vencimento <= (date_trunc('month', p_data_referencia) + interval '1 month - 1 day')::date
    and m.periodo_fim >= date_trunc('month', p_data_referencia)::date;
end;
$$;

comment on function public.alunos_com_mensalidade_no_mes is
  'Lista alunos que já têm mensalidade cobrindo o mês de referência. Chamadas via service_role (edge functions) pulam a checagem de admin — o caller já validou isso; chamadas via anon/authenticated exigem super_admin ou membro do estúdio.';

