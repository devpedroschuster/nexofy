-- Fix de segurança (cont. de 20260909191500): "revoke ... from anon" não
-- bastou porque o EXECUTE nunca tinha sido revogado de PUBLIC — toda function
-- nova recebe EXECUTE para PUBLIC por padrão no Postgres, a menos que seja
-- revogado explicitamente. anon herda de PUBLIC, então continuava podendo
-- chamar mesmo depois do revoke anterior (confirmado via
-- has_function_privilege('anon', ...) = true mesmo após o fix anterior).

revoke execute on function public.agendar_avulso(uuid, bigint, bigint, date, boolean) from public;
grant execute on function public.agendar_avulso(uuid, bigint, bigint, date, boolean) to authenticated;
grant execute on function public.agendar_avulso(uuid, bigint, bigint, date, boolean) to service_role;
