// Predicado único de "módulo ativo pro tenant" (estudios.modulos_ativos).
// Extraído pra fora de useTerminologia() pra ter exatamente UM lugar que
// sabe como checar isso — reaproveitado tanto pelo hook (Sidebar.jsx e
// qualquer outro consumidor de useTerminologia().moduloAtivo) quanto por
// rotaModulo.js (guard de rota, PED-39), que não pode chamar um hook
// porque precisa continuar sendo função pura e testável sem montar
// componente.
export function moduloEstaAtivo(modulosAtivos, chave) {
  return (modulosAtivos ?? []).includes(chave);
}
