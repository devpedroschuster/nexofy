// ─── Midnight Indigo · Redefinir Senha ───────────────────────────────────────
//
// Dois contextos de uso:
//   A. Primeiro acesso (vindo do Login com location.state.primeiroAcesso)
//   B. Reset via link de e-mail (evento PASSWORD_RECOVERY do Supabase)
//
// Design: 100% tokens Midnight Indigo. Zero hardcodes de cor.
// Indicador de força: usa tokens semânticos (destructive, warning, success).
//
// FIX (auditoria): resolução de rota pós-senha agora usa `estudio_membros`
// como fonte de verdade (mesmo mecanismo de useAuth/destinoPosAuth), com
// fallback para alunos/professores legados. Antes, admin/super_admin caíam
// sempre em rotaPorPerfil(null) = '/login', dependendo do redirect de login
// para acertar a rota — funcional, mas incorreto/duplicado.
// FIX (auditoria): updates de `primeiro_acesso` agora checam `error` e logam
// falhas em vez de ignorá-las silenciosamente.
// FIX (auditoria): listener de onAuthStateChange é registrado ANTES de
// getSession() para eliminar a janela de corrida em que o evento
// PASSWORD_RECOVERY pode disparar antes da subscription existir.
// FIX (auditoria): mensagens de erro do Supabase mapeadas para texto
// amigável em vez de expor err.message cru ao usuário.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';

import { rotaPorPerfil } from '../lib/navigation';
import { showToast } from '../components/shared/Toast';
import { LIMITES } from '../lib/constants';
import Input, { Label } from '../components/ui/Input';
import Button from '../components/ui/Button';
import { cn } from '../lib/cn';

const SENHA_MIN = LIMITES.SENHA_MIN;
const TIMEOUT_SESSAO_MS = 6000;

/* ── Lógica de força de senha ───────────────────────────────────────────────── */
function calcularForca(senha) {
  if (!senha) return 0;
  let pontos = 0;
  if (senha.length >= SENHA_MIN)   pontos++;
  if (/[A-Z]/.test(senha))        pontos++;
  if (/[0-9]/.test(senha))        pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  if (pontos <= 1) return 1;
  if (pontos <= 3) return 2;
  return 3;
}

/* Tokens Midnight Indigo — sem hardcode de cor */
const FORCA_CONFIG = [
  null,
  {
    label:      'Fraca',
    segmentos:  1,
    barClass:   'bg-destructive',
    textoClass: 'text-destructive',
    dica:       'Adicione letras maiúsculas, números e símbolos.',
  },
  {
    label:      'Média',
    segmentos:  2,
    barClass:   'bg-warning',
    textoClass: 'text-warning',
    dica:       'Adicione um símbolo especial para fortalecer.',
  },
  {
    label:      'Forte',
    segmentos:  3,
    barClass:   'bg-success',
    textoClass: 'text-success',
    dica:       null,
  },
];

/* ── Indicador de força ─────────────────────────────────────────────────────── */
function IndicadorForca({ senha }) {
  const nivel  = useMemo(() => (senha ? calcularForca(senha) : 0), [senha]);
  const config = FORCA_CONFIG[nivel];

  if (!senha) return null;

  return (
    <div className="mt-2 space-y-1.5" aria-live="polite" aria-atomic="true">
      {/* Barras */}
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={nivel}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              nivel > 0 && i <= (config?.segmentos ?? 0)
                ? config.barClass
                : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Label + dica */}
      {config && (
        <p className={cn('text-xs font-medium leading-snug', config.textoClass)}>
          Senha {config.label}
          {config.dica && (
            <span className="ml-1 font-normal text-muted-foreground">
              — {config.dica}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/* ── Mapeamento de erros do Supabase Auth para texto amigável ────────────────── */
function mensagemErroAmigavel(err) {
  const code = err?.code || err?.error_code;
  const msg  = (err?.message || '').toLowerCase();

  if (code === 'same_password' || msg.includes('different from the old password')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (code === 'weak_password' || msg.includes('weak')) {
    return 'Senha considerada fraca pelo servidor. Tente uma combinação mais forte.';
  }
  if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
  }
  if (msg.includes('session') || msg.includes('token')) {
    return 'Sua sessão de redefinição expirou. Solicite um novo link.';
  }
  return 'Não foi possível salvar a nova senha. Tente novamente.';
}

/* ── Resolução de rota pós-senha ──────────────────────────────────────────────
 * Fonte de verdade: estudio_membros (mesmo mecanismo usado por useAuth /
 * destinoPosAuth no restante do app). Fallback para alunos/professores
 * cobre contas legadas que ainda não têm linha em estudio_membros.
 * Também zera `primeiro_acesso` na tabela correspondente, logando (sem
 * bloquear o fluxo) se a escrita falhar.
 * ────────────────────────────────────────────────────────────────────────── */
async function resolverRotaPosSenha(userId) {
  const { data: membro, error: membroErr } = await supabase
    .from('estudio_membros')
    .select('role')
    .eq('auth_id', userId)
    .maybeSingle();

  if (membroErr) {
    console.error('[RedefinirSenha] Falha ao consultar estudio_membros:', membroErr);
  }

  if (membro?.role) {
    // FIX: antes retornava aqui sem zerar `primeiro_acesso`
    // em `alunos`/`professores`. Como `Login.jsx` ainda decide o redirect
    // para /redefinir-senha lendo essas colunas diretamente (não migrou
    // para estudio_membros), o usuário ficava preso num loop de
    // redefinição de senha a cada novo login.
    const tabelaLegado = membro.role === 'professor' ? 'professores' : 'alunos';
    const { error: updateErr } = await supabase
      .from(tabelaLegado)
      .update({ primeiro_acesso: false })
      .eq('auth_id', userId);

    if (updateErr) {
      console.error(`[RedefinirSenha] Falha ao zerar primeiro_acesso (${tabelaLegado}, via estudio_membros):`, updateErr);
    }

    return rotaPorPerfil(membro.role);
  }

  // Fallback legado: aluno
  const { data: alunoData, error: alunoErr } = await supabase
    .from('alunos')
    .select('role')
    .eq('auth_id', userId)
    .maybeSingle();

  if (alunoErr) {
    console.error('[RedefinirSenha] Falha ao consultar alunos:', alunoErr);
  }

  if (alunoData) {
    const { error: updateErr } = await supabase
      .from('alunos')
      .update({ primeiro_acesso: false })
      .eq('auth_id', userId);
    if (updateErr) {
      console.error('[RedefinirSenha] Falha ao zerar primeiro_acesso (aluno):', updateErr);
    }
    return rotaPorPerfil(alunoData.role);
  }

  // Fallback legado: professor
  const { data: profData, error: profErr } = await supabase
    .from('professores')
    .select('id')
    .eq('auth_id', userId)
    .maybeSingle();

  if (profErr) {
    console.error('[RedefinirSenha] Falha ao consultar professores:', profErr);
  }

  if (profData) {
    const { error: updateErr } = await supabase
      .from('professores')
      .update({ primeiro_acesso: false })
      .eq('auth_id', userId);
    if (updateErr) {
      console.error('[RedefinirSenha] Falha ao zerar primeiro_acesso (professor):', updateErr);
    }
    return rotaPorPerfil('professor');
  }

  // Nenhum vínculo encontrado — /login resolve corretamente via
  // destinoPosAuth (sessão ativa + perfil null → /cadastro/estudio).
  return '/login';
}

/* ── Componente principal ───────────────────────────────────────────────────── */
export default function RedefinirSenha() {
  const [novaSenha, setNovaSenha]         = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [sessaoValida, setSessaoValida]   = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();

  const primeiroAcesso = location.state?.primeiroAcesso ?? false;
  const nomeUsuario    = location.state?.nome ?? '';

  // Erros inline (sem toast para campos)
  const senhasCoincidem = !confirmarSenha || novaSenha === confirmarSenha;

  /* ── Validação de sessão ─────────────────────────────────────────────────── */
  // O link de redefinição popula a sessão via fragmento de URL. O client do
  // Supabase processa esse fragmento na própria inicialização, ou seja, o
  // evento PASSWORD_RECOVERY pode disparar ANTES deste componente montar.
  // Por isso o listener é registrado primeiro, e só depois consultamos
  // getSession() para cobrir o caso em que o evento já foi processado.
  useEffect(() => {
    let resolvido = false;
    let timer = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (resolvido) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && sess)) {
        resolvido = true;
        setSessaoValida(true);
        clearTimeout(timer);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !resolvido) {
        resolvido = true;
        setSessaoValida(true);
        clearTimeout(timer);
      }
    });

    // Timeout de segurança: link expirado ou inválido
    timer = setTimeout(() => {
      if (!resolvido) {
        subscription.unsubscribe();
        showToast.error('Link expirado ou inválido. Solicite um novo.');
        navigate('/login');
      }
    }, TIMEOUT_SESSAO_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [navigate]);

  /* ── Atualização de senha ────────────────────────────────────────────────── */
  async function handleUpdatePassword(e) {
    e.preventDefault();

    if (novaSenha.length < SENHA_MIN) {
      showToast.error(`A senha deve ter pelo menos ${SENHA_MIN} caracteres.`);
      return;
    }
    if (!/[A-Z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      showToast.error('Use ao menos uma letra maiúscula e um número.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      showToast.error('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        console.error('[RedefinirSenha] Falha ao obter usuário após updateUser:', userErr);
      }

      const rotaDestino = user ? await resolverRotaPosSenha(user.id) : '/login';

      showToast.success('Senha definida! Redirecionando…');
      setTimeout(() => navigate(rotaDestino), 1000);

    } catch (err) {
      console.error('[RedefinirSenha] Erro ao salvar nova senha:', err);
      showToast.error(mensagemErroAmigavel(err));
    } finally {
      setLoading(false);
    }
  }

  /* Aguarda validação de sessão sem flash de conteúdo */
  if (!sessaoValida) return null;

  const senhaForca = novaSenha ? calcularForca(novaSenha) : 0;
  const podeSalvar = novaSenha.length >= SENHA_MIN && senhasCoincidem && senhaForca >= 2;

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">

      {/* Aura decorativa */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'var(--gradient-hero)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-card p-8 space-y-7">

          {/* ── Cabeçalho ────────────────────────────────────────────────── */}
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft border border-success/20">
              <ShieldCheck size={26} className="text-success" strokeWidth={2} />
            </div>

            <div>
              <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                {primeiroAcesso ? (
                  nomeUsuario ? `Olá, ${nomeUsuario}!` : 'Bem-vindo!'
                ) : (
                  'Criar nova senha'
                )}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {primeiroAcesso
                  ? 'Defina sua senha pessoal de acesso para continuar.'
                  : 'Escolha uma senha segura para proteger sua conta.'}
              </p>
            </div>
          </div>

          {/* ── Formulário ───────────────────────────────────────────────── */}
          <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate>

            {/* Campo senha */}
            <div className="space-y-0">
              <Label htmlFor="nova-senha" hint={`mín. ${SENHA_MIN} caracteres`}>
                Nova senha
              </Label>
              <Input
                id="nova-senha"
                type={mostrarSenha ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder={`Mínimo ${SENHA_MIN} caracteres`}
                leftIcon={<Lock size={16} />}
                rightIcon={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setMostrarSenha((v) => !v)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
              <IndicadorForca senha={novaSenha} />
            </div>

            {/* Confirmar senha */}
            <div className="space-y-0">
              <Label htmlFor="confirmar-senha">Confirmar senha</Label>
              <Input
                id="confirmar-senha"
                type={mostrarSenha ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Repita a senha"
                leftIcon={<Lock size={16} />}
                error={!senhasCoincidem ? 'As senhas não coincidem.' : undefined}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="default"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!podeSalvar}
              leftIcon={<ShieldCheck size={18} />}
              className="mt-2"
            >
              {primeiroAcesso ? 'Salvar e acessar' : 'Redefinir senha'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}