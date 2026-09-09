-- supabase/migrations/20260908140000_add_sensivel_campos_dinamicos.sql
--
-- PED-173 (achado de auditoria LGPD): `campos_dinamicos` deixava qualquer
-- estúdio criar campo arbitrário (field_type/opcoes livres) sem nenhum
-- controle — um tenant podia criar, sem qualquer aviso, um campo tipo
-- "condição de saúde" ou "orientação religiosa" (categoria de dado
-- sensível, art. 5º II da LGPD) sem consentimento específico.
--
-- Duas camadas, mesmo padrão de defesa em profundidade já usado para
-- link_anamnese/observacoes_medicas (20260905120000_create_consentimentos_
-- responsavel_legal.sql):
--   1. Heurística no banco marca `sensivel = true` automaticamente quando o
--      nome/rótulo do campo sugere categoria sensível — não depende do
--      client lembrar de marcar a checkbox.
--   2. Reaproveita a MESMA tabela `consentimentos_responsavel_legal` (não
--      cria uma nova) para bloquear gravar valor em campo dinâmico sensível
--      de aluno menor de idade sem consentimento do responsável já
--      registrado — mesma trilha de prova, um único lugar pra auditar.
--
-- Heurística é só uma sugestão: o estúdio também pode marcar `sensivel`
-- manualmente para um campo que a heurística não capturou (ex.: "PCD",
-- "grupo sanguíneo"). A trigger nunca desmarca — só liga.

alter table public.campos_dinamicos
  add column sensivel boolean not null default false;

-- Vocabulário deliberadamente restrito às categorias do art. 5º II LGPD
-- (saúde, religião, biometria, genética, opinião política, filiação
-- sindical/partidária, orientação sexual, origem étnica) com variações
-- comuns em PT-BR, acentuadas e não-acentuadas (sem depender da extensão
-- `unaccent`, que não está instalada neste projeto). Falsos positivos
-- (ex.: campo "seguro saúde" para outro fim) são aceitáveis — o efeito é
-- só marcar a flag/exigir consentimento de menor, nunca bloquear o cadastro
-- do campo em si.
create or replace function public.sugere_campo_sensivel(p_field_name text, p_label text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_field_name, '') || ' ' || coalesce(p_label, '')
    ~* '(sa[uú]de|doenc|alerg|medicament|deficien|\mpcd\M|religi[aã]o|crenca|cren[cç]a|etnia|ra[cç]a|orienta[cç][aã]o sexual|homossexual|bissexual|sindicat|filiac[aã]o partid|biometri|impress[aã]o digital|gen[eé]tic|dna\M|\mhiv\M|soropositiv|gravidez|gestante|opini[aã]o pol[ií]tica|transtorno|psiquiatr|psicol[oó]g)';
$$;

revoke execute on function public.sugere_campo_sensivel(text, text)
  from public, anon, authenticated;

create or replace function public.aplicar_heuristica_sensivel_campos_dinamicos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.sugere_campo_sensivel(new.field_name, new.label) then
    new.sensivel := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aplicar_heuristica_sensivel_campos_dinamicos on public.campos_dinamicos;

create trigger trg_aplicar_heuristica_sensivel_campos_dinamicos
  before insert or update on public.campos_dinamicos
  for each row execute function public.aplicar_heuristica_sensivel_campos_dinamicos();

revoke execute on function public.aplicar_heuristica_sensivel_campos_dinamicos()
  from public, anon, authenticated;

-- Gate de verdade (mesmo racional de bloquear_dados_sensiveis_menor_sem_
-- consentimento): bloqueia gravar valor não vazio, em `alunos.metadata`,
-- para qualquer campo dinâmico de entidade 'aluno' marcado `sensivel` de
-- aluno menor de 18 anos sem consentimento do responsável legal já
-- registrado. Só olha o que mudou, mesmo cuidado da trigger irmã (não
-- trava updates de outros campos em registros antigos já preenchidos antes
-- desta migration).
create or replace function public.bloquear_campos_dinamicos_sensiveis_menor_sem_consentimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mudou_campo_sensivel boolean;
  tem_consentimento boolean;
begin
  select exists (
    select 1
    from public.campos_dinamicos cd
    where cd.estudio_id = new.estudio_id
      and cd.entidade = 'aluno'
      and cd.sensivel
      and (new.metadata -> cd.field_name) is not null
      and (new.metadata ->> cd.field_name) <> ''
      and (
        tg_op = 'INSERT'
        or (old.metadata -> cd.field_name) is distinct from (new.metadata -> cd.field_name)
      )
  ) into mudou_campo_sensivel;

  if not mudou_campo_sensivel or new.data_nascimento is null then
    return new;
  end if;

  if new.data_nascimento <= (current_date - interval '18 years')::date then
    return new; -- maior de idade
  end if;

  select exists (
    select 1 from public.consentimentos_responsavel_legal where aluno_id = new.id
  ) into tem_consentimento;

  if not tem_consentimento then
    raise exception
      'Aluno menor de idade sem consentimento do responsável legal registrado. Registre o consentimento antes de preencher campo(s) personalizado(s) sensível(is).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_campos_dinamicos_sensiveis_menor on public.alunos;

create trigger trg_bloquear_campos_dinamicos_sensiveis_menor
  before insert or update on public.alunos
  for each row execute function public.bloquear_campos_dinamicos_sensiveis_menor_sem_consentimento();

revoke execute on function public.bloquear_campos_dinamicos_sensiveis_menor_sem_consentimento()
  from public, anon, authenticated;
