
CREATE OR REPLACE FUNCTION public.eh_admin_do_estudio_atual()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM estudio_membros
    WHERE user_id = auth.uid()
      AND estudio_id = estudio_id_atual()
      AND role IN ('admin', 'super_admin')
  )
$function$;

