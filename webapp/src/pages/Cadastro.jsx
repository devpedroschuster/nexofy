// src/pages/Cadastro.jsx
// ─── Midnight Indigo · Cadastro (self-service, passo 1) ──────────────────────
//
// Cria a conta do responsável pelo estúdio via supabase.auth.signUp().
// Não toca em `estudios` / `estudio_membros` — isso só acontece no passo 2,
// em /cadastro/estudio, depois que o e-mail é confirmado.
//
// Por quê 2 passos: liga a criação do estúdio a um e-mail já verificado,
// evita estúdios "fantasma" de bots, e reaproveita o fluxo de confirmação
// nativo do Supabase Auth sem código extra de envio de e-mail.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Sparkles, MailCheck } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { showToast } from '../components/shared/Toast';
import { REGEX, LIMITES } from '../lib/constants';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function Cadastro() {
  const [nome, setNome]     = useState('');
  const [email, setEmail]   = useState('');
  const [senha, setSenha]   = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const navigate = useNavigate();

  function validar() {
    if (!nome.trim()) {
      showToast.error('Digite seu nome completo.');
      return false;
    }
    if (!REGEX.EMAIL.test(email.trim())) {
      showToast.error('Digite um e-mail válido.');
      return false;
    }
    if (senha.length < LIMITES.SENHA_MIN) {
      showToast.error(`A senha deve ter no mínimo ${LIMITES.SENHA_MIN} caracteres.`);
      return false;
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || !validar()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: senha,
        options: {
          data: { nome: nome.trim() },
          emailRedirectTo: `${window.location.origin}/cadastro/estudio`,
        },
      });

      if (error) throw error;

      // Supabase retorna um user "fantasma" (sem identities) quando o e-mail
      // já existe e está confirmado — não lança erro, pra evitar enumeração.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        showToast.error('Este e-mail já está cadastrado. Tente entrar.');
        setLoading(false);
        return;
      }

      // Se a confirmação de e-mail estiver desligada no projeto, o Supabase
      // já retorna uma sessão ativa — nesse caso pula direto pro passo 2.
      if (data.session) {
        navigate('/cadastro/estudio');
        return;
      }

      setEnviado(true);
    } catch (err) {
      if (err.message?.toLowerCase().includes('already registered')) {
        showToast.error('Este e-mail já está cadastrado. Tente entrar.');
      } else {
        showToast.error('Não foi possível criar sua conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'var(--gradient-hero)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-card p-8 space-y-7">

          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-elegant">
              <Sparkles size={24} className="text-primary-foreground" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                Criar sua conta
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                O primeiro passo para colocar seu estúdio no Nexofy.
              </p>
            </div>
          </div>

          {enviado ? (
            <div className="space-y-5">
              <div className="flex gap-3 rounded-xl bg-success-soft border border-success/20 p-4">
                <MailCheck size={18} className="text-success shrink-0 mt-0.5" />
                <p className="text-sm text-success font-medium leading-relaxed">
                  Enviamos um link de confirmação para <strong>{email.trim()}</strong>.
                  Abra seu e-mail para continuar o cadastro do seu estúdio.
                </p>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-3">
                <Input
                  type="text"
                  required
                  autoFocus
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  aria-label="Nome completo"
                  leftIcon={<User size={16} />}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />

                <Input
                  type="email"
                  required
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
                  autoComplete="new-password"
                  placeholder={`Crie uma senha (mín. ${LIMITES.SENHA_MIN} caracteres)`}
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
                Continuar
              </Button>
            </form>
          )}

          <div className="text-center">
            <a
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              Já tem uma conta? Entrar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}