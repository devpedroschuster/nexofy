// Decide o destino de uma rota protegida por módulo (PED-39 — canary
// release por tenant via estudios.modulos_ativos). Extraído como função
// pura (mesmo padrão de webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js)
// pra poder testar a composição com rotaPorPerfil() sem montar componente.
//
// Fail-closed deliberado: diferente da salvaguarda de Sidebar.jsx (lista
// de módulos vazia NÃO esconde item de menu, pra não piscar um sidebar
// incompleto durante a corrida de carregamento do perfil), aqui lista
// vazia ou ausente BLOQUEIA a rota. A diferença de contexto justifica a
// diferença de comportamento: o componente que usa esta função
// (RotaComModulo, em App.jsx) só é renderizado dentro de RotaPrivada, que
// já mostra um spinner e não renderiza nada enquanto `loading` for true —
// não existe, aqui, a mesma corrida que o Sidebar precisa absorver. E o
// custo de errar é oposto: no Sidebar, esconder de mais é pior que
// mostrar de mais (link quebrado); num guard de acesso, liberar de mais é
// pior que bloquear de mais.
import { rotaPorPerfil } from './navigation';

export function destinoRotaModulo(modulosAtivos, moduloExigido, perfil) {
  if ((modulosAtivos ?? []).includes(moduloExigido)) return null;
  return rotaPorPerfil(perfil);
}
