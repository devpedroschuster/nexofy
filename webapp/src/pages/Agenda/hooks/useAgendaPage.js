import { useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';

const MOBILE_BREAKPOINT = 768;

export function useAgendaPage() {
  // `perfil`/`professorId` não vêm mais deste hook: Agenda.jsx já os obtém
  // de useAuth(), a fonte única usada por todo o app para essa informação
  // (evita duas fontes de verdade divergentes decidindo `isAdmin`).
  // Removido junto: dependência de useOutletContext, que ficou morta aqui.
  const isMobile = useIsMobile();

  const [currentDate, setCurrentDate] = useState(new Date());

  const [currentView, setCurrentView] = useState(
    () => (typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT) ? 'day' : 'week'
  );

  // Rastreia se o usuário escolheu a view manualmente, para não sobrescrever
  // a escolha dele ao simplesmente rotacionar o dispositivo.
  const [viewFoiAlteradaManualmente, setViewFoiAlteradaManualmente] = useState(false);

  const [filtroProf, setFiltroProf] = useState('todos');
  const [filtroEspaco, setFiltroEspaco] = useState('todos');

  // Alterna a view automaticamente ao cruzar o breakpoint mobile/desktop,
  // a menos que o usuário já tenha escolhido a view manualmente. Ajuste
  // feito durante o render (em vez de em useEffect) para reagir à mudança
  // de `isMobile` sem o re-render extra de um effect.
  const [ultimoIsMobile, setUltimoIsMobile] = useState(isMobile);
  if (isMobile !== ultimoIsMobile) {
    setUltimoIsMobile(isMobile);
    if (!viewFoiAlteradaManualmente) {
      setCurrentView(isMobile ? 'day' : 'week');
    }
  }

  const handleSetCurrentView = (view) => {
    setViewFoiAlteradaManualmente(true);
    setCurrentView(view);
  };

  return {
    currentDate, setCurrentDate,
    currentView, setCurrentView: handleSetCurrentView,
    filtroProf, setFiltroProf,
    filtroEspaco, setFiltroEspaco,
  };
}
