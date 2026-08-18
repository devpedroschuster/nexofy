import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

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

  useEffect(() => {
    if (!viewFoiAlteradaManualmente) {
      setCurrentView(isMobile ? 'day' : 'week');
    }
  }, [isMobile, viewFoiAlteradaManualmente]);

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
