import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function useIsMobile(breakpoint = 768) {
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
  const { perfil, professorId } = useOutletContext();
  const isMobile = useIsMobile();

  const [currentDate, setCurrentDate] = useState(new Date());

  // BUG #2: estado inicial lê window.innerWidth uma única vez, igual ao que useIsMobile
  // faz internamente — elimina a duplicação da detecção de breakpoint.
  const [currentView, setCurrentView] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );

  // BUG #3: rastreia se o usuário escolheu a view manualmente para não sobrescrever
  // ao rotacionar o dispositivo.
  const [viewFoiAlteradaManualmente, setViewFoiAlteradaManualmente] = useState(false);

  const [filtroProf, setFiltroProf] = useState('todos');
  const [filtroEspaco, setFiltroEspaco] = useState('todos');

  // Reage a rotação/resize — mas respeita escolha manual do usuário (BUG #3).
  useEffect(() => {
    if (!viewFoiAlteradaManualmente) {
      setCurrentView(isMobile ? 'day' : 'week');
    }
  }, [isMobile, viewFoiAlteradaManualmente]);

  // Wrapper que marca a view como escolhida manualmente antes de aplicá-la.
  const handleSetCurrentView = (view) => {
    setViewFoiAlteradaManualmente(true);
    setCurrentView(view);
  };

  return {
    perfil,
    professorId,
    currentDate, setCurrentDate,
    currentView, setCurrentView: handleSetCurrentView,
    filtroProf, setFiltroProf,
    filtroEspaco, setFiltroEspaco,
  };
}