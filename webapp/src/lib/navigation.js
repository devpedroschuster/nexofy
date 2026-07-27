// webapp/src/lib/navigation.js
// Centraliza a rota de destino pós-login por perfil.
// Fonte de verdade dos valores de perfil: ROLES em ./constants.js

import { ROLES } from './constants';

const ROTA_POR_PERFIL = {
  [ROLES.SUPER_ADMIN]: '/super',
  [ROLES.ADMIN]:       '/dashboard',
  [ROLES.PROFESSOR]:   '/agenda',
  [ROLES.ALUNO]:       '/area-aluno',
};

export function rotaPorPerfil(perfil) {
  const rota = ROTA_POR_PERFIL[perfil];

  if (!rota && perfil && import.meta.env.DEV) {
    // Ajuda a distinguir "usuário não autenticado" de
    // "perfil válido mas não mapeado neste arquivo".
    console.warn(`[navigation] Perfil "${perfil}" não mapeado em ROTA_POR_PERFIL — redirecionando para /login.`);
  }

  return rota || '/login';
}