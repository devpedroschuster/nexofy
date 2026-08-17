// Extraído de cadastroService.js para ser reaproveitado por qualquer
// service que chame supabase.functions.invoke() — hoje cadastroService e
// superAdminService, evita duplicação (DRY).
//
// O supabase-js (functions.invoke) NÃO parseia automaticamente o corpo
// JSON quando o status HTTP é não-2xx: ele apenas seta `error` como um
// FunctionsHttpError genérico e guarda a Response original em
// `error.context`. Sem isso, mensagens de negócio da function (slug em
// uso, conta já vinculada, e-mail não confirmado etc.) ficam invisíveis
// pro usuário final.
export async function extrairMensagemErro(error, fallback) {
  try {
    const corpo = await error?.context?.json();
    if (corpo?.error) return corpo.error;
  } catch {
    // corpo ausente, já consumido, ou não era JSON — usa o fallback
  }
  return error?.message || fallback;
}