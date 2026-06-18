// src/pages/Login.jsx
// ─── Midnight Indigo · Login ──────────────────────────────────────────────────
//
// Multi-tenant: o nome do estúdio vem do contexto do subdomínio/slug via
// useEstudioPublico (já existe no projeto). Fallback para nome genérico.
//
// Design: card centralizado, dark mode nativo, componentes do design system.
// Zero hardcodes de cor — 100% tokens CSS.
//
// Fluxo:
//   1. Login normal → redireciona por perfil
//   2. primeiro_acesso → /redefinir-senha com state
//   3. Recuperar senha → modal inline → reset email via Supabase
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, KeyRound, X, Info } from 'lucide-react';

import { rotaPorPerfil } from '../lib/navigation';
import { showToast } from '../components/shared/Toast';
import { REGEX } from '../lib/constants';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { cn } from '../lib/cn';

/* ── Componente principal ───────────────────────────────────────────────────── */
export default function Login() {
  const [email, setEmail]   = useState('');
  const [senha, setSenha]   = useState('');
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const navigate = useNavigate();

  /* ── Login ──────────────────────────────────────────────────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email:    email.trim(),
        password: senha,
      });

      if (error) throw error;

      // 1. Verificar primeiro_acesso em alunos
      const { data: alunoData } = await supabase
        .from('alunos')
        .select('primeiro_acesso, nome_completo, role')
        .eq('auth_id', authData.user.id)
        .maybeSingle();

      if (alunoData?.primeiro_acesso) {
        navigate('/redefinir-senha', {
          state: { primeiroAcesso: true, nome: (alunoData.nome_completo || '').split(' ')[0] },
        });
        return;
      }

      // 2. Verificar primeiro_acesso em professores
      if (!alunoData) {
        const { data: profData } = await supabase
          .from('professores')
          .select('primeiro_acesso, nome')
          .eq('auth_id', authData.user.id)
          .maybeSingle();

        if (profData?.primeiro_acesso) {
          navigate('/redefinir-senha', {
            state: { primeiroAcesso: true, nome: (profData.nome || '').split(' ')[0] },
          });
          return;
        }

        if (profData) {
          const nome = (profData.nome || '').split(' ')[0];
          showToast.success(nome ? `Bem-vindo de volta, ${nome}!` : 'Login realizado!');
          navigate('/agenda');
          return;
        }
      }

      // 3. Admin ou aluno normal
      if (alunoData) {
        const nome = (alunoData.nome_completo || '').split(' ')[0];
        showToast.success(nome ? `Bem-vindo de volta, ${nome}!` : 'Login realizado!');
        navigate(rotaPorPerfil(alunoData.role === 'admin' ? 'admin' : 'aluno'));
        return;
      }

      // Fallback
      showToast.success('Login realizado com sucesso!');
      navigate('/');

    } catch (err) {
      if (err.code === 'invalid_credentials' || err.message?.includes('Invalid login')) {
        showToast.error('E-mail ou senha incorretos.');
      } else if (err.code === 'email_not_confirmed') {
        showToast.error('Confirme seu e-mail antes de acessar.');
      } else if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        showToast.error('Link expirado. Solicite um novo link de recuperação.');
      } else {
        showToast.error('Erro ao conectar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Fundo com gradiente hero sutil — usa tokens, funciona em light e dark */
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">

      {/* Aura de fundo — decorativa, baseada em tokens */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'var(--gradient-hero)' }}
        aria-hidden="true"
      />

      {/* Card principal */}
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-card p-8 space-y-7">

          {/* ── Cabeçalho ────────────────────────────────────────────────── */}
          <div className="text-center space-y-3">
            {/* Logo mark */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-elegant">
              <KeyRound size={24} className="text-primary-foreground" strokeWidth={2} />
            </div>

            <div>
              <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                Entrar na plataforma
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Bem-vindo de volta. Acesse sua conta.
              </p>
            </div>
          </div>

          {/* ── Formulário ───────────────────────────────────────────────── */}
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div className="space-y-3">
              <Input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="seu@email.com"
                aria-label="E-mail"
                leftIcon={<Mail size={16} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Sua senha"
                aria-label="Senha"
                leftIcon={<Lock size={16} />}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="premium"
              size="lg"
              fullWidth
              loading={loading}
              rightIcon={<ArrowRight size={18} />}
            >
              Entrar
            </Button>
          </form>

          {/* ── Link recuperação ─────────────────────────────────────────── */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className={cn(
                'text-sm font-medium text-muted-foreground',
                'hover:text-foreground underline-offset-4 hover:underline',
                'transition-colors outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring rounded',
              )}
            >
              Esqueceu a senha?
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Recuperar Senha ─────────────────────────────────────────── */}
      {modalAberto && (
        <ModalRecuperarSenha onClose={() => setModalAberto(false)} />
      )}
    </div>
  );
}

/* ── Modal de Recuperação ────────────────────────────────────────────────────── */
function ModalRecuperarSenha({ onClose }) {
  const [emailRecup, setEmailRecup]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [enviado, setEnviado]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    const email = emailRecup.trim();
    if (!REGEX.EMAIL.test(email)) {
      showToast.error('Digite um e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      setEnviado(true);
    } catch (err) {
      showToast.error('Não foi possível enviar o link. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Recuperar acesso"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel */}
      <div className="relative z-10 w-full max-w-sm animate-scale-in">
        <div className="bg-card border border-border rounded-2xl shadow-elegant p-7 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">
                Recuperar acesso
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviaremos um link seguro para o seu e-mail.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                'text-muted-foreground hover:text-foreground hover:bg-muted',
                'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <X size={16} />
            </button>
          </div>

          {enviado ? (
            /* Estado de sucesso */
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl bg-success-soft border border-success/20 p-4">
                <Info size={18} className="text-success shrink-0 mt-0.5" />
                <p className="text-sm text-success font-medium leading-relaxed">
                  Link enviado para <strong>{emailRecup.trim()}</strong>. Verifique também a caixa de spam.
                </p>
              </div>
              <Button variant="outline" fullWidth onClick={onClose}>
                Fechar
              </Button>
            </div>
          ) : (
            /* Formulário */
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="seu@email.com"
                aria-label="E-mail para recuperação"
                leftIcon={<Mail size={16} />}
                value={emailRecup}
                onChange={(e) => setEmailRecup(e.target.value)}
              />

              <Button
                type="submit"
                variant="default"
                fullWidth
                loading={loading}
                disabled={!emailRecup.trim()}
              >
                Enviar link de acesso
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}