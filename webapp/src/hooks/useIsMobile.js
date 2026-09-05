import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

// Extraído de Agenda/hooks/useAgendaPage.js pra ser reaproveitado fora da
// Agenda (ex: Alunos.jsx) sem duplicar a lógica de matchMedia.
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
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
