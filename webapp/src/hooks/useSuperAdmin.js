// webapp/src/hooks/useSuperAdmin.js
//
// Hook leve que deriva `isSuperAdmin` do useAuth já existente.
// Não faz nenhuma query adicional — o perfil já foi resolvido no boot.
//
// Uso:
//   const { isSuperAdmin, loading } = useSuperAdmin();

import { useAuth } from './useAuth';

export function useSuperAdmin() {
  const { perfil, loading, sessao } = useAuth();

  return {
    isSuperAdmin: perfil === 'super_admin',
    loading,
    autenticado: !!sessao,
  };
}