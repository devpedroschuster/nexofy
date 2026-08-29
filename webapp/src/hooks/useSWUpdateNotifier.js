import { useEffect } from 'react';
import { showToast } from '../components/shared/Toast';

const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000; // 5 minutos

// sw.js já ativa a versão nova sozinho (skipWaiting no install + clients.claim
// no activate — ver webapp/public/sw.js), então 'controllerchange' é o sinal
// exato do momento em que o JS/CSS já carregado nesta aba passa a divergir
// da versão que o Service Worker está servindo. A primeira troca (sem
// controller antes) é só a ativação inicial, não uma atualização — por isso
// o detector ignora ela e só avisa a partir da segunda troca em diante.
export function criarDetectorDeAtualizacao(jaTinhaControllerInicial) {
  let jaTinhaController = jaTinhaControllerInicial;
  return function aoTrocarController() {
    if (!jaTinhaController) {
      jaTinhaController = true;
      return false;
    }
    return true;
  };
}

// PED-70: controllerchange só dispara quando o navegador já rechecou sw.js e
// achou bytes diferentes — mas as únicas rechecagens hoje são passivas
// (register() no load de main.jsx e a cada mount do Sidebar via usePWA.js).
// Uma aba que fica muito tempo sem navegar/remontar o Sidebar pode não notar
// uma atualização por bastante tempo. Isto força rechecagens ativas via
// registration.update(): periodicamente, e sempre que a aba volta a ficar
// visível. `doc` é injetado (em vez de usar `document` direto) pra dar pra
// testar sem precisar de jsdom (o ambiente de teste deste projeto é 'node').
export function agendarVerificacaoAtiva(registration, doc, intervalMs = INTERVALO_VERIFICACAO_MS) {
  const verificar = () => registration.update().catch(() => {});
  const intervalId = setInterval(verificar, intervalMs);

  function aoMudarVisibilidade() {
    if (doc.visibilityState === 'visible') verificar();
  }
  doc.addEventListener('visibilitychange', aoMudarVisibilidade);

  return function cancelar() {
    clearInterval(intervalId);
    doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
  };
}

export function useSWUpdateNotifier() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const deveNotificar = criarDetectorDeAtualizacao(Boolean(navigator.serviceWorker.controller));

    function aoTrocarController() {
      if (deveNotificar()) {
        showToast.custom('Nova versão disponível.', () => window.location.reload(), 'Atualizar', Infinity);
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarController);

    let cancelarVerificacaoAtiva;
    let cancelado = false;
    navigator.serviceWorker.ready.then((registration) => {
      if (cancelado) return;
      cancelarVerificacaoAtiva = agendarVerificacaoAtiva(registration, document);
    });

    return () => {
      cancelado = true;
      navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarController);
      cancelarVerificacaoAtiva?.();
    };
  }, []);
}
