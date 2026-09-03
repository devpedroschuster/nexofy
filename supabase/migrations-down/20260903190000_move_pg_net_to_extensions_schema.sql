-- Restaura pg_net no schema public (estado anterior a
-- 20260903190000_move_pg_net_to_extensions_schema.sql). Objetos em "net"
-- não são afetados nos dois sentidos — só o extnamespace muda de novo.
drop extension if exists pg_net;
create extension if not exists pg_net with schema public version '0.20.4';
