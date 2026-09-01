-- PED-105: criar_estudio_transacional ganha p_iniciar_trial (default true).
-- Self-service (criar-meu-estudio) chama sem passar o parâmetro — ganha
-- 14 dias. Onboarding manual do super_admin (criar-estudio) passa
-- p_iniciar_trial => false — nasce sem prazo (acordo comercial à parte).
--
-- Adicionando parâmetro novo com DEFAULT no final: DROP a 7-arg signature,
-- então CREATE a 8-arg signature. Embora CREATE OR REPLACE FUNCTION
-- geralmente preserve o OID quando apenas muda o corpo, adicionar um
-- novo parâmetro (mesmo com DEFAULT) muda a arity e criaria um segundo
-- overload. Fazemos DROP explícito para substituir completamente a
-- função e garantir que 7-arg calls usem o new 8-arg overload via default.
-- Reaplicamos GRANT/REVOKE explicitamente por segurança (mesmo espírito
-- do RLS_MIGRATION_CHECKLIST).
DROP FUNCTION IF EXISTS public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text);

CREATE OR REPLACE FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text, p_iniciar_trial boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estudio_id UUID;
BEGIN

  -- ── 1. CRIAR ESTÚDIO ───────────────────────────────────────────────────────
  INSERT INTO public.estudios (nome, slug, whatsapp, instagram, trial_ends_at)
  VALUES (
    p_nome, p_slug, p_whatsapp, p_instagram,
    CASE WHEN p_iniciar_trial THEN now() + interval '14 days' ELSE NULL END
  )
  RETURNING id INTO v_estudio_id;

  -- ── 2. VINCULAR ADMIN AO ESTÚDIO ──────────────────────────────────────────
  INSERT INTO public.estudio_membros (estudio_id, user_id, role)
  VALUES (v_estudio_id, p_admin_id, 'admin');

  -- ── 3. PROVISIONAR CONFIGURAÇÕES DE REPASSE PADRÃO ────────────────────────
  INSERT INTO public.configuracoes_repasse (
    estudio_id,
    valor_1_modalidade,
    valor_multi_modalidade,
    plano_livre_pct_prof,
    plano_livre_pct_casa,
    aula_avulsa_valor,
    aula_avulsa_pct_prof,
    aula_avulsa_pct_casa,
    aula_experimental_valor,
    aula_experimental_pct_prof
  )
  VALUES (
    v_estudio_id,
    0, 0, 0, 100,
    0, 0, 100,
    0, 0
  );

  -- ── RETORNO ────────────────────────────────────────────────────────────────
  RETURN json_build_object(
    'estudio_id', v_estudio_id,
    'estudio_nome', p_nome,
    'estudio_slug', p_slug
  );

END;
$function$
;

GRANT EXECUTE ON FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text, p_iniciar_trial boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text, p_iniciar_trial boolean) FROM public, anon, authenticated;
