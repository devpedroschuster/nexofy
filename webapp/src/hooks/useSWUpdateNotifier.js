import { useEffect } from 'react';
import { showToast } from '../components/shared/Toast';

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

export function useSWUpdateNotifier() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const deveNotificar = criarDetectorDeAtualizacao(Boolean(navigator.serviceWorker.controller));

    function aoTrocarController() {
      if (deveNotificar()) {
        showToast.custom('Nova versão disponível.', () => window.location.reload(), 'Atualizar');
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarController);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarController);
  }, []);
}
