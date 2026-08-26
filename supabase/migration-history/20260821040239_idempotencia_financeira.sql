-- Idempotência financeira (Seção 1 do Plano de Go-Live)
-- Granularidade validada contra dados reais de produção em 2026-08-21.

-- 1. repasses_lancamentos: impede duplicação do lote mensal
--    (o código em gerar-repasses-mensais/index.ts já trata o erro 23505
--    vindo deste índice como "já gerado")
CREATE UNIQUE INDEX IF NOT EXISTS repasses_lote_unico
  ON repasses_lancamentos (estudio_id, data_referencia, professor_id, modalidade, tipo_aula)
  WHERE mensalidade_id IS NULL;

-- 2. mensalidades: impede duplicação de cobrança regular gerada duas
--    vezes para o mesmo aluno/plano/vencimento. Inclui plano_id na chave
--    porque troca de plano no meio do ciclo pode gerar 2 mensalidades
--    legítimas no mesmo mês (confirmado com dados reais: Gabriela
--    Hammerschmitt e Matheus Neumann). Restrito a tipo_aula='regular'
--    pois avulsa/experimental são cobranças pontuais por natureza.
CREATE UNIQUE INDEX IF NOT EXISTS mensalidades_lote_unico
  ON mensalidades (estudio_id, aluno_id, plano_id, data_vencimento)
  WHERE tipo_aula = 'regular';

-- 3. mensalidades: coluna para o webhook-pagamento rejeitar eventos do
--    Asaas fora de ordem (reentrega tardia não pode reverter um status
--    mais recente).
ALTER TABLE mensalidades
  ADD COLUMN IF NOT EXISTS asaas_event_timestamp timestamptz;

COMMENT ON COLUMN mensalidades.asaas_event_timestamp IS
  'Timestamp do último evento do Asaas efetivamente aplicado (payment.confirmedDate/paymentDate). Usado por webhook-pagamento para descartar eventos reentregues fora de ordem.';
