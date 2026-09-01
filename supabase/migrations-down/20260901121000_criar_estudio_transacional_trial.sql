-- Reverte 20260901121000_criar_estudio_transacional_trial.sql: remove o
-- parâmetro p_iniciar_trial e a lógica de trial_ends_at, restaurando
-- criar_estudio_transacional à sua forma de 7 argumentos anterior à
-- PED-105. Não reverte a coluna estudios.trial_ends_at em si (essa é
-- responsabilidade da down-migration de 20260901120000, se/quando
-- existir) — só a function. Testar contra staging antes de aplicar de
-- verdade num incidente, conforme supabase/migrations-down/README.md.
DROP FUNCTION IF EXISTS public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text, p_iniciar_trial boolean);

CREATE FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estudio_id UUID;
BEGIN

  -- ── 1. CRIAR ESTÚDIO ───────────────────────────────────────────────────────
  INSERT INTO public.estudios (nome, slug, whatsapp, instagram)
  VALUES (p_nome, p_slug, p_whatsapp, p_instagram)
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

GRANT EXECUTE ON FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text) FROM public, anon, authenticated;
