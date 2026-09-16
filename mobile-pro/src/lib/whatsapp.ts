// mobile-pro/src/lib/whatsapp.ts
// Formata um telefone brasileiro para o formato esperado por wa.me — decide
// pelo TAMANHO do número, não por um prefixo fixo: um telefone com 10-11
// dígitos ainda não tem o DDI (adiciona "55"); com 12-13 dígitos já tem.
// Prefixar "55" sem checar o tamanho duplica o DDI em números que já o têm.
export function formatarWhatsApp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

export function gerarLinkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const numero = formatarWhatsApp(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
