-- Auditoria de grants de EXECUTE em functions SECURITY DEFINER (PED-83/PED-84)
--
-- Por que existe: `SECURITY DEFINER` roda com os privilégios do dono da
-- function, ou seja, ignorando RLS. Se `anon` (usuário deslogado) puder
-- chamá-la via `/rest/v1/rpc/<nome>`, qualquer falha de autorização *dentro*
-- da function vira bypass de tenant, não um simples erro de permissão.
--
-- Pior: esses grants somem sozinhos. `DROP FUNCTION` + `CREATE FUNCTION`
-- (necessário sempre que a assinatura ou o tipo de retorno muda) cria um
-- objeto novo, com o ACL default do Postgres — `EXECUTE` liberado pra
-- `PUBLIC` — apagando qualquer `REVOKE` anterior sem erro nem aviso. Foi
-- assim que 4 helpers internos voltaram a ficar expostos entre 12/08 e 29/08
-- (PED-83), e é o risco sistêmico registrado na PED-84.
--
-- Como usar: rode em staging E em produção (SQL Editor ou `execute_sql` do
-- MCP) depois de qualquer migration que crie/redefina function, e
-- periodicamente (ex.: antes de cada release). O `get_advisors` do Supabase
-- cobre parte disto (lints 0028/0029), mas só olha `anon`/`authenticated` —
-- esta query mostra o ACL real, inclusive o grant em `PUBLIC`, que é o
-- mecanismo pelo qual `anon` costuma herdar acesso sem aparecer nomeado.
--
-- Como ler o resultado: comparar staging vs produção linha a linha.
-- Divergência é drift e deve virar migration (produção é a referência). Hoje o
-- resultado esperado, nos dois ambientes, são apenas as 3 RPCs públicas por
-- design da landing page: estudio_publico, modalidades_publicas,
-- planos_publicos.

select
  p.proname                                 as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  -- `grantee = 0` é PUBLIC no aclexplode; qualquer role comum (anon,
  -- authenticated) herda dele.
  bool_or(a.grantee = 0)                    as publico_tem_execute,
  bool_or(r.rolname = 'anon')               as anon_tem_execute_direto,
  bool_or(r.rolname = 'authenticated')      as authenticated_tem_execute,
  coalesce(p.proacl::text, '(default: EXECUTE pra PUBLIC)') as acl_completo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
-- proacl NULL = ACL default do Postgres, que JÁ inclui EXECUTE pra PUBLIC
-- (é esse o estado em que uma function recém-criada nasce). `acldefault`
-- materializa esse default pra ele não passar batido como "sem grants".
left join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  on a.privilege_type = 'EXECUTE'
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.prosecdef
group by p.oid, p.proname, p.proacl
-- Só o que é alcançável por um cliente do browser: grant em PUBLIC ou em anon.
-- (Tire o HAVING pra ver o inventário completo, incluindo as
-- authenticated-only.)
having bool_or(a.grantee = 0) or bool_or(r.rolname = 'anon')
order by 1;
