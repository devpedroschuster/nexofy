// webapp/src/lib/navigation.js
// Centraliza a rota de destino pós-login por perfil.
// Adicionado: 'super_admin' → '/super'

export function rotaPorPerfil(perfil) {
  switch (perfil) {
    case 'super_admin': return '/super';
    case 'admin':       return '/dashboard';
    case 'professor':   return '/agenda';
    case 'aluno':       return '/area-aluno';
    default:            return '/login';
  }
}