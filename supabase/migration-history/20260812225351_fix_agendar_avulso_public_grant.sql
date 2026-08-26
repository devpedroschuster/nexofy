REVOKE EXECUTE ON FUNCTION public.agendar_avulso(uuid,bigint,bigint,date,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendar_avulso(uuid,bigint,bigint,date,boolean) TO authenticated;
