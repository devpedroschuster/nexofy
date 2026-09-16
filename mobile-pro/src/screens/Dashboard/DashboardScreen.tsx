// mobile-pro/src/screens/Dashboard/DashboardScreen.tsx
import React from 'react';
import { useSessaoAtual } from '@/features/auth';
import DashboardAdmin from '@/screens/Dashboard/DashboardAdmin';
import DashboardProfessor from '@/screens/Dashboard/DashboardProfessor';

export default function DashboardScreen() {
  const { papel, estudioId, professorId, nomeUsuario } = useSessaoAtual();
  return papel === 'admin'
    ? <DashboardAdmin estudioId={estudioId} />
    : <DashboardProfessor estudioId={estudioId} professorId={professorId} nomeUsuario={nomeUsuario} />;
}
