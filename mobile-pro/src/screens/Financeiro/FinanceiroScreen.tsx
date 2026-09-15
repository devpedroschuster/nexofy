// mobile-pro/src/screens/Financeiro/FinanceiroScreen.tsx
import React from 'react';
import { useSessaoAtual } from '@/features/auth';
import InadimplenciaAdmin from '@/screens/Financeiro/InadimplenciaAdmin';
import RepassesProfessor from '@/screens/Financeiro/RepassesProfessor';

export default function FinanceiroScreen() {
  const { papel, estudioId, professorId } = useSessaoAtual();
  return papel === 'admin'
    ? <InadimplenciaAdmin estudioId={estudioId} />
    : <RepassesProfessor estudioId={estudioId} professorId={professorId} />;
}
