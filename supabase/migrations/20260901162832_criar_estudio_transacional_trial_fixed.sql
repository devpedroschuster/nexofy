-- PED-159 — reconciliação retroativa de drift de bookkeeping: esta migration
-- já estava aplicada em staging (qjmybxkfjkxttggdjxga) desde 2026-09-01,
-- rodada ad-hoc sem nunca virar arquivo no repo. Recuperado de
-- supabase_migrations.schema_migrations de staging (mesmo texto de
-- statements, sem alteração).
--
-- Contexto original: 20260901121000_criar_estudio_transacional_trial.sql
-- adicionou p_iniciar_trial via CREATE OR REPLACE, mas em staging isso
-- deixou 2 overloads coexistindo (7-arg antigo + 8-arg novo) em vez de
-- substituir — provável efeito de CREATE OR REPLACE com arity diferente.
-- Esta migration corrige com DROP explícito da assinatura de 7 args antes
-- do CREATE da de 8, garantindo um único overload.
--
-- Verificado nesta sessão (PED-159): produção (tciiepqmnrrcjnqhspvw) já
-- tem hoje um único overload (8 args, com p_iniciar_trial) sem nunca ter
-- recebido esta migration — o DROP FUNCTION IF EXISTS da assinatura de 7
-- args é no-op lá (nunca existiu esse overload em produção). Este arquivo
-- fecha o gap de bookkeeping do repo; idempotente e seguro reaplicar em
-- qualquer ambiente.
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
