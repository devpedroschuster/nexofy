-- supabase/migrations/20260905120000_create_consentimentos_responsavel_legal.sql
--
-- PED-170 (LGPD art. 14): alunos.data_nascimento não tinha nenhum gate de
-- maioridade — só limitava a 120 anos de idade máxima
-- (webapp/src/lib/validation.js). Estúdios de dança/natação/musculação
-- frequentemente têm alunos entre 14 e 17 anos, e a LGPD exige tratamento
-- diferenciado e consentimento específico do responsável legal para
-- titulares menores de idade, especialmente antes de habilitar campos de
-- dado sensível de saúde (link_anamnese/observacoes_medicas).
--
-- Append-only de propósito, mesmo racional de `consentimentos`
-- (20260903210000_create_consentimentos.sql): é registro de prova de
-- consentimento (art. 8º §2º LGPD) — alterar/apagar uma linha depois de
-- criada destruiria o próprio valor probatório. Um novo consentimento
-- (ex.: mudança de responsável) é sempre uma linha NOVA, nunca um update
-- na antiga.
--
-- Tabela separada de `alunos` (em vez de colunas soltas) porque o dado do
-- responsável (nome/CPF/parentesco) só faz sentido junto do carimbo de
-- quando/quem aceitou — e porque `alunos.id` é bigint sem FK pra
-- auth.users, então não dava pra reaproveitar a tabela `consentimentos`
-- (cujo user_id referencia auth.users diretamente: aqui quem consente é o
-- responsável legal, não necessariamente um usuário do sistema).

create table if not exists public.consentimentos_responsavel_legal (
  id                uuid primary key default gen_random_uuid(),
  aluno_id          bigint not null references public.alunos(id) on delete cascade,
  estudio_id        uuid not null references public.estudios(id),
  nome_responsavel  text not null,
  cpf_responsavel   text,
  parentesco        text not null check (parentesco in ('mae', 'pai', 'tutor_legal', 'outro')),
  registrado_por    uuid references auth.users(id),
  aceito_em         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists idx_consentimentos_resp_legal_aluno_id
  on public.consentimentos_responsavel_legal(aluno_id);

create index if not exists idx_consentimentos_resp_legal_estudio_id
  on public.consentimentos_responsavel_legal(estudio_id);

alter table public.consentimentos_responsavel_legal enable row level security;

-- Mesmo padrão tenant_select/tenant_insert já usado em outras tabelas
-- filhas de aluno (ex.: historico_planos) — sem policy de UPDATE/DELETE
-- (append-only).
create policy tenant_select on public.consentimentos_responsavel_legal
  as permissive for select to public
  using (
    (estudio_id = (select public.estudio_id_atual()))
    or (select public.eh_super_admin())
  );

create policy tenant_insert on public.consentimentos_responsavel_legal
  as permissive for insert to public
  with check (
    (estudio_id = (select public.estudio_id_atual()))
    and (select public.eh_admin_do_estudio_atual())
  );

-- Gate de verdade: enforced no banco, não só no client (JS pode ser
-- contornado por qualquer chamada direta à REST API com a mesma sessão).
-- Bloqueia gravar link_anamnese/observacoes_medicas com valor novo e
-- não-vazio em aluno menor de 18 anos sem consentimento já registrado.
-- Só olha o que MUDOU (new IS DISTINCT FROM old) pra não travar updates
-- de outros campos em registros antigos que já tinham esse dado
-- preenchido antes desta migration existir.
create or replace function public.bloquear_dados_sensiveis_menor_sem_consentimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mudou_dado_sensivel boolean;
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

  if not mudou_dado_sensivel or new.data_nascimento is null then
    return new;
  end if;

  if new.data_nascimento <= (current_date - interval '18 years')::date then
    return new; -- maior de idade
  end if;

  select exists (
    select 1 from public.consentimentos_responsavel_legal
    where aluno_id = new.id
  ) into tem_consentimento;

  if not tem_consentimento then
    raise exception
      'Aluno menor de idade sem consentimento do responsável legal registrado. Registre o consentimento (nome, CPF e parentesco do responsável) antes de preencher dados sensíveis de saúde.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_dados_sensiveis_menor on public.alunos;

create trigger trg_bloquear_dados_sensiveis_menor
  before insert or update on public.alunos
  for each row execute function public.bloquear_dados_sensiveis_menor_sem_consentimento();

-- Mesmo padrão de 20260903210000_create_consentimentos.sql: função só
-- existe pra ser usada pelo trigger acima (triggers rodam com o
-- privilégio do dono da função, não do role da transação), então fecha a
-- superfície pública desnecessária de RPC auto-exposta pelo PostgREST.
revoke execute on function public.bloquear_dados_sensiveis_menor_sem_consentimento()
  from public, anon, authenticated;
