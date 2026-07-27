// webapp/src/hooks/useSuperAdmin.js
//
// Hook leve que deriva `isSuperAdmin` do useAuth já existente.
// Não faz nenhuma query adicional — o perfil já foi resolvido no boot.
//
// Uso:
//   const { isSuperAdmin, loading, erro } = useSuperAdmin();

import { useMemo } from 'react';
import { useAuth } from './useAuth';

export function useSuperAdmin() {
  // FIX: agora também lemos erroPerfil, para distinguir "não é super admin"
  // de "falha transitória ao resolver o perfil" (ver RotaSuperAdmin).
  const { perfil, loading, sessao, erroPerfil } = useAuth();

  // FIX: memoizado para manter igualdade referencial entre renders
  // (evita re-execuções desnecessárias em efeitos que dependam do objeto inteiro).
  return useMemo(() => ({
    isSuperAdmin: perfil === 'super_admin',
    loading,
    autenticado: !!sessao,
    erro: erroPerfil,
  }), [perfil, loading, sessao, erroPerfil]);
}