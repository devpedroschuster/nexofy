create or replace function public.receita_total_paga()
returns numeric
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return (
    select coalesce(sum(valor_pago), 0)
    from mensalidades
    where status = 'pago'
  );
end;
$function$;
