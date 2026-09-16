-- 1. Remove o CHECK antigo primeiro — enquanto não existe nenhum CHECK
--    sobre status_conversao, a coluna aceita qualquer texto, o que deixa
--    o backfill do passo 2 livre para gravar os novos valores. Rodar
--    ADD CONSTRAINT antes do backfill falha contra as linhas 'pendente'
--    ainda não migradas; rodar o UPDATE antes do DROP falha contra a
--    constraint ANTIGA, que não conhece 'aula_agendada'/'novo'. A ordem
--    DROP → UPDATE → ADD é a única que funciona nos dois lados.
alter table public.leads drop constraint leads_status_conversao_check;

-- 2. Backfill dos leads existentes com 'pendente': quem já tem aula/data
--    marcada vira 'aula_agendada'; os demais viram 'novo'.
update public.leads
  set status_conversao = case
    when data_visita is not null then 'aula_agendada'
    else 'novo'
  end
  where status_conversao = 'pendente';

-- 3. Amplia o CHECK de status_conversao para os estágios do funil —
--    só agora, com todas as linhas já conformes ao novo conjunto de
--    valores.
alter table public.leads add constraint leads_status_conversao_check
  check (status_conversao = any (array[
    'novo', 'contatado', 'aula_agendada', 'negociacao',
    'convertido', 'perdido'
  ]));

-- 4. Campos do follow-up agendado.
alter table public.leads
  add column proximo_followup_em timestamptz null,
  add column nota_followup text null;

-- 5. criar_lead_com_presenca passa a definir o estágio inicial conforme
--    o lead já nasce com aula/data vinculada ou não.
create or replace function public.criar_lead_com_presenca(
  p_estudio_id uuid, p_nome text, p_telefone text,
  p_aula_id bigint, p_data_visita date
)
returns leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead leads;
  v_pode_escrever boolean;
  v_estagio_inicial text;
begin
  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid()
      and estudio_id = p_estudio_id
      and role = any(array['admin', 'professor'])
  ) into v_pode_escrever;

  if not v_pode_escrever then
    raise exception 'Acesso negado: você não tem permissão para criar leads neste estúdio.';
  end if;

  v_estagio_inicial := case when p_aula_id is not null then 'aula_agendada' else 'novo' end;

  insert into leads (estudio_id, nome_visitante, telefone_visitante,
                     aula_id, data_visita, status_conversao)
  values (p_estudio_id, p_nome, p_telefone,
          p_aula_id, p_data_visita, v_estagio_inicial)
  returning * into v_lead;

  insert into presencas (estudio_id, aula_id, data_aula, origem, lead_id, status)
  values (p_estudio_id, p_aula_id, p_data_visita, 'lead', v_lead.id, 'agendado');

  return v_lead;
end;
$function$;
