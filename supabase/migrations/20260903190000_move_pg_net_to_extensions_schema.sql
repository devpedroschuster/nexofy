-- PED-131: move a extensão pg_net do schema public pro schema extensions
-- (Security Advisor do Supabase: extension_in_public).
--
-- pg_net não é relocatable (extrelocatable=false), então `ALTER EXTENSION
-- pg_net SET SCHEMA extensions` não funciona — precisa dropar e recriar.
-- Isso é seguro aqui: os objetos de fato da extensão (net.http_post,
-- net.http_get, net.http_delete, net._http_response) sempre vivem no schema
-- dedicado "net", independente do schema em que a extensão é registrada —
-- só o extnamespace de pg_net muda. O cron job "cobrancas-mensais"
-- (cron.job) que chama net.http_post continua funcionando sem alteração.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions version '0.20.4';
