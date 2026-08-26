-- VULNERABILIDADE: EXECUTE estava liberado para 'anon' nesta função
-- SECURITY DEFINER que cria estúdios e insere membros com role='admin'
-- para QUALQUER p_admin_id passado — sem nenhuma checagem de quem chama.
--
-- As duas Edge Functions que legitimamente criam estúdios
-- (criar-estudio, criar-meu-estudio) já fazem toda a autorização
-- necessária (super_admin / e-mail confirmado / 1-estúdio-por-conta)
-- ANTES de chamar esta RPC, e o fazem usando a service_role key — nunca
-- o client do navegador. Restringir o EXECUTE a service_role fecha o
-- acesso direto via supabase.rpc() do client sem quebrar nenhum fluxo
-- existente.
revoke execute on function criar_estudio_transacional(text, text, text, text, uuid, text, text) from public;
revoke execute on function criar_estudio_transacional(text, text, text, text, uuid, text, text) from anon;
revoke execute on function criar_estudio_transacional(text, text, text, text, uuid, text, text) from authenticated;
-- service_role e postgres mantêm o acesso (necessário para as Edge Functions).
