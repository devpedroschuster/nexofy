-- Reverte 20260903000000_prevent_assinatura_nexofy_tampering.sql: remove a
-- trigger e a function. Depois deste down, o admin do próprio estúdio volta
-- a poder zerar asaas_subscription_id (e as outras 4 colunas de assinatura)
-- via PATCH direto na API REST, anulando a guarda contra assinatura
-- duplicada em assinar-plano-nexofy/index.ts. Só para uso de emergência
-- caso a trigger esteja bloqueando um caminho legítimo inesperado.
DROP TRIGGER IF EXISTS trg_prevent_assinatura_nexofy_tampering ON public.estudios;
DROP FUNCTION IF EXISTS public.prevent_assinatura_nexofy_tampering();
