-- PED-115 (final review fix): mesma lacuna que a PED-105 fechou pra
-- trial_ends_at (ver 20260901160000_prevent_trial_tampering.sql) existe
-- agora pras colunas de assinatura Nexofy adicionadas em
-- 20260902170000_add_plano_nexofy_estudios.sql — o admin do próprio
-- estúdio já tem UPDATE via RLS ("tenant: update proprio estudio") sem
-- checagem por coluna, então sem esta trigger ele poderia zerar
-- asaas_subscription_id via PATCH direto na API REST, o que anula a
-- guarda contra assinatura duplicada em assinar-plano-nexofy/index.ts
-- (que depende exatamente dessa coluna pra recusar uma segunda tentativa).
--
-- service_role passa (assinar-plano-nexofy e webhook-assinatura-nexofy,
-- ambos usam a service role key). super_admin passa (mesma exceção já
-- concedida pra trial_ends_at). Qualquer outro authenticated é bloqueado
-- se tentar alterar qualquer uma das 5 colunas de assinatura — outras
-- colunas de estudios continuam livres.
CREATE OR REPLACE FUNCTION public.prevent_assinatura_nexofy_tampering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (
       new.plano_nexofy is distinct from old.plano_nexofy
    or new.ciclo_cobranca is distinct from old.ciclo_cobranca
    or new.assinatura_status is distinct from old.assinatura_status
    or new.asaas_customer_id_nexofy is distinct from old.asaas_customer_id_nexofy
    or new.asaas_subscription_id is distinct from old.asaas_subscription_id
     )
     and not eh_super_admin()
     and auth.role() <> 'service_role' then
    raise exception 'Alteração de dados de assinatura Nexofy não permitida' using errcode = '42501';
  end if;
  return new;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.prevent_assinatura_nexofy_tampering() TO service_role;
REVOKE EXECUTE ON FUNCTION public.prevent_assinatura_nexofy_tampering() FROM public, anon, authenticated;

CREATE TRIGGER trg_prevent_assinatura_nexofy_tampering BEFORE UPDATE ON public.estudios FOR EACH ROW EXECUTE FUNCTION prevent_assinatura_nexofy_tampering();
