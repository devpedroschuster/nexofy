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

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Sparkles, MailCheck, ShieldCheck } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { showToast } from '../components/shared/Toast';
import { REGEX, LIMITES, LINKS } from '../lib/constants';
import Input, { ErrorMessage } from '../components/ui/Input';
import Button from '../components/ui/Button';

// FIX: removido NOME_MAX local (=120) divergente de LIMITES.NOME_MAX (=100).
// Antes: front permitia até 120 chars enquanto o backend/DB assume 100 como
// limite de negócio — risco de truncamento silencioso ou erro fora de contexto.
// Agora LIMITES.NOME_MAX é a única fonte de verdade.

export default function Cadastro() {
  const [nome, setNome]     = useState('');
  const [email, setEmail]   = useState('');
  const [senha, setSenha]   = useState('');
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  // Erros inline por campo — antes cada clique em "Continuar" só revelava um
  // erro por vez via toast. Agora valida tudo de uma vez e mostra cada erro
  // junto do campo que o causou (FormField/ErrorMessage já suportavam isso,
  // este formulário só não usava).
  const [erros, setErros] = useState({});

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planoEscolhido = searchParams.get('plano');
  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);

  function validar() {
    const novosErros = {};
    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      novosErros.nome = 'Digite seu nome completo.';
    } else if (nomeLimpo.length < LIMITES.NOME_MIN) {
      novosErros.nome = `O nome deve ter no mínimo ${LIMITES.NOME_MIN} caracteres.`;
    }

    if (!REGEX.EMAIL.test(email.trim())) {
      novosErros.email = 'Digite um e-mail válido.';
    }

    if (senha.length < LIMITES.SENHA_MIN) {
      novosErros.senha = `A senha deve ter no mínimo ${LIMITES.SENHA_MIN} caracteres.`;
    }

    if (!aceitaTermos) {
      novosErros.termos = 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.';
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  // Limpa o erro do campo assim que a pessoa começa a corrigi-lo, em vez de
  // deixar a borda vermelha até o próximo submit.
  function limparErro(campo) {
    setErros((atual) => {
      if (!atual[campo]) return atual;
      const { [campo]: _removido, ...resto } = atual;
      return resto;
    });
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
          data: { nome: nome.trim().slice(0, LIMITES.NOME_MAX) },
          emailRedirectTo: `${window.location.origin}/cadastro/estudio`,
        },
      });

      if (error) throw error;

      // Supabase retorna um user "fantasma" (sem identities) quando o e-mail
      // já existe e está confirmado — não lança erro, pra evitar enumeração.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        showToast.error('Este e-mail já está cadastrado. Tente entrar.');
        return;
      }

      // Se a confirmação de e-mail estiver desligada no projeto, o Supabase
      // já retorna uma sessão ativa — nesse caso pula direto pro passo 2.
      if (data.session) {
        navigate('/cadastro/estudio');
        return;
      }

      if (montadoRef.current) setEnviado(true);
    } catch (err) {
      // Prioriza o código de erro do Supabase (estável entre versões da API);
      // cai pra checagem de string só como fallback defensivo.
      const jaExiste =
        err?.code === 'user_already_exists' ||
        err?.message?.toLowerCase().includes('already registered');

      // FIX: trata explicitamente rate limit do Supabase em vez de cair na
      // mensagem genérica — usuário entende o que aconteceu e o que fazer.
      const rateLimited =
        err?.code === 'over_email_send_rate_limit' || err?.status === 429;

      if (jaExiste) {
        showToast.error('Este e-mail já está cadastrado. Tente entrar.');
      } else if (rateLimited) {
        showToast.error('Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.');
      } else {
        // FIX: antes o catch não logava nada — qualquer erro fora dos dois
        // casos previstos era invisível em produção. Agora fica rastreável
        // (console aqui; trocar por Sentry/observabilidade quando disponível).
        console.error('[Cadastro] Falha ao criar conta:', err);
        showToast.error('Não foi possível criar sua conta. Tente novamente.');
      }
    } finally {
      if (montadoRef.current) setLoading(false);
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
            {planoEscolhido && !enviado && (
              <p className="text-xs font-semibold text-primary bg-primary/soft inline-flex rounded-full px-3 py-1">
                Você está criando sua conta no plano {planoEscolhido}
              </p>
            )}
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
                <div>
                  <Input
                    type="text"
                    required
                    autoFocus
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    aria-label="Nome completo"
                    leftIcon={<User size={16} />}
                    value={nome}
                    maxLength={LIMITES.NOME_MAX}
                    error={Boolean(erros.nome)}
                    errorId="erro-nome"
                    onChange={(e) => { setNome(e.target.value); limparErro('nome'); }}
                  />
                  <ErrorMessage id="erro-nome">{erros.nome}</ErrorMessage>
                </div>

                <div>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="seu@email.com"
                    aria-label="E-mail"
                    leftIcon={<Mail size={16} />}
                    value={email}
                    error={Boolean(erros.email)}
                    errorId="erro-email"
                    onChange={(e) => { setEmail(e.target.value); limparErro('email'); }}
                  />
                  <ErrorMessage id="erro-email">{erros.email}</ErrorMessage>
                </div>

                <div>
                  <Input
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder={`Crie uma senha (mín. ${LIMITES.SENHA_MIN} caracteres)`}
                    aria-label="Senha"
                    leftIcon={<Lock size={16} />}
                    value={senha}
                    error={Boolean(erros.senha)}
                    errorId="erro-senha"
                    onChange={(e) => { setSenha(e.target.value); limparErro('senha'); }}
                  />
                  <ErrorMessage id="erro-senha">{erros.senha}</ErrorMessage>
                </div>
              </div>

              <div>
                <label className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                  <input
                    type="checkbox"
                    checked={aceitaTermos}
                    onChange={(e) => { setAceitaTermos(e.target.checked); limparErro('termos'); }}
                    aria-invalid={Boolean(erros.termos)}
                    aria-describedby={erros.termos ? 'erro-termos' : undefined}
                    className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                  />
                  <span>
                    Li e aceito os{' '}
                    <a href={LINKS.TERMOS} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e a{' '}
                    <a href={LINKS.PRIVACIDADE} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
                      Política de Privacidade
                    </a>{' '}
                    do Nexofy.
                  </span>
                </label>
                <ErrorMessage id="erro-termos">{erros.termos}</ErrorMessage>
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

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck size={13} className="text-success" /> 14 dias grátis, sem cartão
              </p>
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