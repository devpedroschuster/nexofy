-- meu_estudio_id(): membros normais só resolvem o estudio_id se o estúdio
-- estiver ativo. super_admin com override de impersonation continua
-- acessando qualquer estúdio (necessário para reativar/gerenciar).
create or replace function public.meu_estudio_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    public.estudio_ativo_via_override(),
    (
      select em.estudio_id
      from estudio_membros em
      join estudios e on e.id = em.estudio_id
      where em.user_id = auth.uid()
        and e.status = 'ativo'
      limit 1
    )
  );
$function$;

-- estudio_id_atual(): mesma regra, usada pelas policies de RLS.
create or replace function public.estudio_id_atual()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    public.estudio_ativo_via_override(),
    (
      select em.estudio_id
      from estudio_membros em
      join estudios e on e.id = em.estudio_id
      where em.user_id = auth.uid()
        and e.status = 'ativo'
      limit 1
    )
  );
$function$;

-- RPC para o front-end checar explicitamente o motivo do bloqueio
-- (em vez de simplesmente receber telas vazias via RLS).
create or replace function public.verificar_status_estudio()
returns table(estudio_id uuid, nome text, status text, bloqueado boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select e.id, e.nome, e.status, (e.status <> 'ativo') as bloqueado
  from estudio_membros em
  join estudios e on e.id = em.estudio_id
  where em.user_id = auth.uid()
  order by em.created_at asc
  limit 1;
$function$;

grant execute on function public.verificar_status_estudio() to authenticated;
