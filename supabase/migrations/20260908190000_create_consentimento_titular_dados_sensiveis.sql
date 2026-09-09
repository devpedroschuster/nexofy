-- supabase/migrations/20260908190000_create_consentimento_titular_dados_sensiveis.sql
--
-- PED-168 (LGPD art. 5º, II e art. 11, I): `alunos.observacoes_medicas` e
-- `alunos.link_anamnese` são dado sensível de saúde e exigem consentimento
-- específico e destacado do próprio titular — não apenas o aceite genérico
-- de Termos/Privacidade (public.consentimentos) já capturado no cadastro.
--
-- A migration 20260905120000 (PED-170) já cobre a metade "responsável
-- legal" desse critério de aceite (para aluno menor de idade). Esta
-- migration cobre a outra metade: a evidência de consentimento do próprio
-- titular, exigida sempre que o aluno é maior de idade (ou a data de
-- nascimento ainda não está cadastrada — sem saber a idade não há como
-- assumir que o gate mais fraco basta).
--
-- Quem opera este sistema é a equipe do estúdio, não o aluno diretamente
-- (a área de autoatendimento do aluno, AreaAluno.jsx, nunca edita esses
-- dois campos — só o painel administrativo, PerfilAluno.jsx, edita). Por
-- isso o consentimento aqui é registrado pelo operador do estúdio
-- atestando que o titular autorizou, com timestamp e versão do texto
-- apresentado — mesmo racional de `registrado_por` em
-- `consentimentos_responsavel_legal`.
--
-- Append-only de propósito, mesmo motivo das duas tabelas de consentimento
-- já existentes: é registro de prova (art. 8º §2º LGPD); alterar/apagar
-- uma linha depois de criada destruiria o próprio valor probatório. Um
-- reaceite (ex.: nova versão do texto) é sempre uma linha NOVA.

create table if not exists public.consentimentos_dados_sensiveis_saude (
  id              uuid primary key default gen_random_uuid(),
  aluno_id        bigint not null references public.alunos(id) on delete cascade,
  estudio_id      uuid not null references public.estudios(id),
  versao          text not null,
  registrado_por  uuid references auth.users(id),
  aceito_em       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_consentimentos_dados_sensiveis_aluno_id
  on public.consentimentos_dados_sensiveis_saude(aluno_id);

create index if not exists idx_consentimentos_dados_sensiveis_estudio_id
  on public.consentimentos_dados_sensiveis_saude(estudio_id);

alter table public.consentimentos_dados_sensiveis_saude enable row level security;

-- Mesmo padrão tenant_select/tenant_insert de consentimentos_responsavel_legal
-- — sem policy de UPDATE/DELETE (append-only).
create policy tenant_select on public.consentimentos_dados_sensiveis_saude
  as permissive for select to public
  using (
    (estudio_id = (select public.estudio_id_atual()))
    or (select public.eh_super_admin())
  );

create policy tenant_insert on public.consentimentos_dados_sensiveis_saude
  as permissive for insert to public
  with check (
    (estudio_id = (select public.estudio_id_atual()))
    and (select public.eh_admin_do_estudio_atual())
  );

-- Gate de verdade no banco (mesmo racional de
-- bloquear_dados_sensiveis_menor_sem_consentimento, que esta função
-- substitui): bloqueia gravar link_anamnese/observacoes_medicas com valor
-- novo e não-vazio sem consentimento já registrado — do responsável legal
-- se o titular for menor de idade, do próprio titular caso contrário
-- (maior de idade, ou data de nascimento ainda desconhecida — sem saber a
-- idade não há base para assumir que nenhum consentimento é necessário).
-- Só olha o que MUDOU (new IS DISTINCT FROM old) pra não travar updates de
-- outros campos em registros antigos que já tinham esse dado preenchido
-- antes desta migration (e da anterior) existirem.
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
    ) into tem_consentimento;

    if not tem_consentimento then
      raise exception
        'Consentimento específico do titular para dado sensível de saúde ainda não registrado. Registre o consentimento antes de preencher anamnese/observações médicas.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_dados_sensiveis_menor on public.alunos;
drop function if exists public.bloquear_dados_sensiveis_menor_sem_consentimento();

create trigger trg_bloquear_dados_sensiveis_sem_consentimento
  before insert or update on public.alunos
  for each row execute function public.bloquear_dados_sensiveis_sem_consentimento_titular();

-- Mesmo padrão de 20260905120000: função só existe pra ser usada pelo
-- trigger acima (triggers rodam com o privilégio do dono da função, não do
-- role da transação), então fecha a superfície pública desnecessária de
-- RPC auto-exposta pelo PostgREST.
revoke execute on function public.bloquear_dados_sensiveis_sem_consentimento_titular()
  from public, anon, authenticated;
