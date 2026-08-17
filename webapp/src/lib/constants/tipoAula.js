export const TIPO_AULA_LABELS = {
  regular: 'Regular',
  plano_livre: 'Plano Livre',
  avulsa: 'Avulsa',
  experimental: 'Experimental',
};

export function tipoAulaLabel(tipo) {
  return TIPO_AULA_LABELS[tipo] ?? tipo ?? '—';
}