-- supabase/migrations/20260916100000_criar_lead_publico_sem_aula.sql
--
-- PED-192: o formulário público de captação (Landing.jsx, sem aula/data
-- selecionada) chama `criarLeadPublico`, que reaproveitava a RPC
-- `criar_lead_com_presenca` (pensada para o fluxo de STAFF agendando um
-- visitante numa aula específica). Isso quebrava de duas formas
-- independentes, ambas fatais para o caminho público:
--
-- 1. `criar_lead_com_presenca` só tem EXECUTE concedido a `authenticated`/
--    `service_role`/`postgres` — nunca a `anon`. A landing page é pública,
--    sem sessão (`useEstudioPublico`, sem login) — a chamada via anon key
--    já falha com "permission denied" antes de qualquer lógica interna.
-- 2. Mesmo com EXECUTE liberado, a função checa
--    `estudio_membros.user_id = auth.uid() and role in (admin, professor)`
--    — para um visitante anônimo `auth.uid()` é null, então essa checagem
--    nunca passa ("Acesso negado"). E mesmo que passasse, o segundo insert
--    (em `presencas`, incondicional) grava `aula_id`/`data_aula` com os
--    valores nulos recebidos — ambas colunas são NOT NULL nessa tabela,
--    então falharia aí também.
--
-- Em vez de tentar remendar `criar_lead_com_presenca` para servir os dois
-- casos (staff autenticado COM aula vs. público anônimo SEM aula), esta
-- migration segue o padrão já estabelecido no repo para acesso público
-- (`estudio_publico`, `planos_publicos`, `modalidades_publicas`: RPC
-- dedicada, SECURITY DEFINER, grant explícito a `anon`) e cria
-- `criar_lead_publico` — só insere em `leads` (sem `presencas`, já que não
-- há aula/comparecimento a registrar para uma captação genérica), e não
-- exige vínculo de staff com o estúdio.
--
-- `criar_lead_com_presenca` continua inalterada — seu único call site
-- (`useAgendamento.js`, agendamento de visitante numa aula específica)
-- sempre informa aula_id/data_visita e roda autenticado como staff.
create or replace function public.criar_lead_publico(
  p_estudio_id uuid, p_nome text, p_telefone text
)
returns leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead leads;
begin
  if not exists (
    select 1 from estudios where id = p_estudio_id and status = 'ativo'
  ) then
    raise exception 'Estúdio não encontrado ou inativo.';
  end if;

  insert into leads (estudio_id, nome_visitante, telefone_visitante, status_conversao)
  values (p_estudio_id, p_nome, p_telefone, 'novo')
  returning * into v_lead;

  return v_lead;
end;
$function$;

grant execute on function public.criar_lead_publico(uuid, text, text) to anon;
grant execute on function public.criar_lead_publico(uuid, text, text) to authenticated;
grant execute on function public.criar_lead_publico(uuid, text, text) to service_role;

-- `leads.data_visita` era NOT NULL desde o baseline — nunca havia um
-- caminho de criação de lead sem aula/data até a captação pública da
-- landing page. Migration aditiva (relaxa uma constraint, não remove
-- dado nem coluna) — sem necessidade de "down" por não ser destrutiva
-- (docs/DEPLOY.md, seção 6).
alter table public.leads alter column data_visita drop not null;
