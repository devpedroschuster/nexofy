-- supabase/migrations/20260928150000_lgpd_consentimento_saude_aceito_pelo_titular.sql
--
-- PED-244 (LGPD art. 11, I): o "consentimento do titular" para dado sensível
-- de saúde (observacoes_medicas/link_anamnese) era um checkbox marcado pelo
-- OPERADOR do estúdio atestando que o aluno autorizou — rastreabilidade de
-- quem afirmou, não evidência de que o próprio titular consentiu. Pior: o
-- insert nem gravava registrado_por (coluna sem default, client não enviava).
--
-- Decisão de produto: o admin só SOLICITA; quem aceita é o próprio aluno,
-- logado (Área do Aluno no webapp ou app mobile). O registro guarda o
-- auth.uid() do titular, a versão do texto apresentado e o horário.
--
--   1. consentimentos_dados_sensiveis_saude.origem ('titular' | 'operador'),
--      decidida pelo BANCO num trigger BEFORE INSERT — nunca pelo client:
--      'titular' só quando quem insere é a conta vinculada ao próprio aluno.
--      O trigger também carimba registrado_por = auth.uid() e aceito_em = now().
--   2. RLS: sai o INSERT de admin (tenant_insert); entra INSERT/SELECT do
--      próprio aluno. Continua append-only (sem UPDATE/DELETE).
--   3. alunos.consentimento_saude_solicitado_em: marcado pelo admin para o
--      pedido aparecer para o aluno.
--   4. Gate bloquear_dados_sensiveis_sem_consentimento_titular: aluno maior
--      de idade (ou sem data de nascimento) só pode ter anamnese/observações
--      gravadas com consentimento de origem 'titular'. Registros antigos de
--      origem 'operador' ficam guardados como histórico, mas não liberam mais.
--      O ramo de menor de idade (consentimento do responsável legal, PED-170)
--      não muda.

-- 1. Origem do consentimento -----------------------------------------------

alter table public.consentimentos_dados_sensiveis_saude
  add column if not exists origem text not null default 'operador'
    check (origem in ('operador', 'titular'));

create or replace function public.carimbar_consentimento_dados_sensiveis_saude()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrado_por := auth.uid();
  new.aceito_em := now();
  new.origem := case
    when auth.uid() is not null and exists (
      select 1 from public.alunos a
      where a.id = new.aluno_id
        and a.estudio_id = new.estudio_id
        and a.auth_id = auth.uid()
    ) then 'titular'
    else 'operador'
  end;
  return new;
end;
$$;

revoke execute on function public.carimbar_consentimento_dados_sensiveis_saude()
  from public, anon, authenticated;

drop trigger if exists trg_carimbar_consentimento_dados_sensiveis_saude on public.consentimentos_dados_sensiveis_saude;
create trigger trg_carimbar_consentimento_dados_sensiveis_saude
  before insert on public.consentimentos_dados_sensiveis_saude
  for each row execute function public.carimbar_consentimento_dados_sensiveis_saude();

-- 2. RLS: quem registra é o próprio titular ----------------------------------

drop policy if exists tenant_insert on public.consentimentos_dados_sensiveis_saude;

create policy titular_insert on public.consentimentos_dados_sensiveis_saude
  as permissive for insert to authenticated
  with check (
    exists (
      select 1 from public.alunos a
      where a.id = consentimentos_dados_sensiveis_saude.aluno_id
        and a.estudio_id = consentimentos_dados_sensiveis_saude.estudio_id
        and a.auth_id = (select auth.uid())
    )
  );

create policy titular_select on public.consentimentos_dados_sensiveis_saude
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.alunos a
      where a.id = consentimentos_dados_sensiveis_saude.aluno_id
        and a.auth_id = (select auth.uid())
    )
  );

-- 3. Pedido de consentimento feito pelo admin --------------------------------

alter table public.alunos
  add column if not exists consentimento_saude_solicitado_em timestamptz;

-- 4. Gate: só consentimento dado pelo próprio titular libera ------------------

create or replace function public.bloquear_dados_sensiveis_sem_consentimento_titular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mudou_dado_sensivel boolean;
  eh_menor boolean;
  tem_consentimento boolean;
begin
  if tg_op = 'INSERT' then
    mudou_dado_sensivel :=
      (new.link_anamnese is not null and new.link_anamnese <> '')
      or (new.observacoes_medicas is not null and new.observacoes_medicas <> '');
  else
    mudou_dado_sensivel :=
      (new.link_anamnese is distinct from old.link_anamnese
        and new.link_anamnese is not null and new.link_anamnese <> '')
      or (new.observacoes_medicas is distinct from old.observacoes_medicas
        and new.observacoes_medicas is not null and new.observacoes_medicas <> '');
  end if;

  if not mudou_dado_sensivel then
    return new;
  end if;

  eh_menor := new.data_nascimento is not null
    and new.data_nascimento > (current_date - interval '18 years')::date;

  if eh_menor then
    select exists (
      select 1 from public.consentimentos_responsavel_legal
      where aluno_id = new.id
    ) into tem_consentimento;

    if not tem_consentimento then
      raise exception
        'Aluno menor de idade sem consentimento do responsável legal registrado. Registre o consentimento (nome, CPF e parentesco do responsável) antes de preencher dados sensíveis de saúde.';
    end if;
  else
    select exists (
      select 1 from public.consentimentos_dados_sensiveis_saude
      where aluno_id = new.id
        and origem = 'titular'
    ) into tem_consentimento;

    if not tem_consentimento then
      raise exception
        'O próprio aluno ainda não autorizou o registro de dados de saúde. Solicite o consentimento para que ele aceite no app ou na Área do Aluno antes de preencher anamnese/observações médicas.';
    end if;
  end if;

  return new;
end;
$$;
