import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

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
  // Defesa: evita "Cannot destructure property of undefined" se o hook
  // for usado fora da árvore de rotas que fornece o Outlet context.
  // ATENÇÃO: o Layout pai precisa passar `professorId` em
  // <Outlet context={{ perfil, professorId }} /> — hoje ele só passa `perfil`,
  // então `professorId` chega sempre undefined até essa correção ser feita lá.
  const { perfil, professorId } = useOutletContext() ?? {};

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
    perfil,
    professorId,
    currentDate, setCurrentDate,
    currentView, setCurrentView: handleSetCurrentView,
    filtroProf, setFiltroProf,
    filtroEspaco, setFiltroEspaco,
  };
}