// src/components/shared/EntrarComGoogle.jsx
// Botão "Continuar com Google" + divisor "ou", para uso em Login.jsx e
// Cadastro.jsx (PED-111). Dispara o redirect OAuth via Supabase; o retorno
// (sessão criada ou erro) é tratado pelo guard de rotas em App.jsx e pelo
// handler de erro em Login.jsx — este componente só inicia o fluxo.
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { showToast } from './Toast';
import Button from '../ui/Button';
import { cn } from '../../lib/cn';

function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.14 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1C3.25 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.74z" />
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export default function EntrarComGoogle({ texto = 'Continuar com Google', className }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      // redirectTo aponta sempre para /login: é a única das rotas públicas
      // (/, /login, /cadastro) cujo componente trata o retorno de erro do
      // OAuth via query string — ver useEffect em Login.jsx. Em caso de
      // sucesso, o guard de rotas de App.jsx (destinoPosAuth) já redireciona
      // dali para o destino certo por perfil, então não importa qual delas
      // o usuário usou para iniciar o login.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      // Sucesso navega o navegador inteiro para o Google — não há mais
      // nada a fazer neste componente, então o loading fica ligado até lá.
    } catch (err) {
      console.error('[EntrarComGoogle] Falha ao iniciar login com Google:', err);
      showToast.error('Não foi possível conectar com o Google. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        fullWidth
        loading={loading}
        leftIcon={<GoogleIcon />}
        onClick={handleClick}
      >
        {texto}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
