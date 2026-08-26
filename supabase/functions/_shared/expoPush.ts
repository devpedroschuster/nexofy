// supabase/functions/_shared/expoPush.ts
//
// Envio de UMA notificação push via Expo Push API. Para envio em lote
// (múltiplos destinatários), ver a lógica dedicada em lembretes-aula/index.ts
// — este helper é deliberadamente mínimo, usado pelo webhook-pagamento
// (PED-14) para notificar um único aluno após confirmação de pagamento.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Envia um push Expo para `pushToken`. Não lança se `pushToken` for
 * vazio/nulo (aluno sem app instalado ou notificações desativadas) —
 * simplesmente não faz nada. Lança em caso de falha de rede/HTTP para que
 * o chamador possa reportar ao Sentry.
 */
export async function enviarPushUnico(
  pushToken: string | null | undefined,
  title: string,
  body: string,
): Promise<void> {
  if (!pushToken) return;

  const resposta = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify([{ to: pushToken, title, body }]),
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    throw new Error(`Expo push falhou (HTTP ${resposta.status}): ${corpoErro}`);
  }
}
