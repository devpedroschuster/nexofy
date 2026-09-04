// webapp/src/lib/redefinirSenhaRoteamento.js
// Resolução de rota pós-redefinição de senha, extraída de RedefinirSenha.jsx
// (PED-139) pra poder ser testada sem depender de ESLint react-refresh, que
// exige que arquivos de página só exportem componentes.

import { supabase } from './supabase';
import { rotaPorPerfil } from './navigation';

/* ── Resolução de rota pós-senha ──────────────────────────────────────────────
 * Fonte de verdade: estudio_membros (mesmo mecanismo usado por useAuth /
 * destinoPosAuth no restante do app). Fallback para alunos/professores
 * cobre contas legadas que ainda não têm linha em estudio_membros.
 * Também zera `primeiro_acesso` na tabela correspondente, logando (sem
 * bloquear o fluxo) se a escrita falhar.
 * ────────────────────────────────────────────────────────────────────────── */
export async function resolverRotaPosSenha(userId) {
  const { data: membro, error: membroErr } = await supabase
    .from('estudio_membros')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (membroErr) {
    // FIX (PED-139): erro real de consulta (ex.: coluna inexistente) não é
    // "sem vínculo" — antes caía nos fallbacks legados em silêncio, o que
    // escondeu por meses o bug de coluna errada (auth_id vs user_id) aqui.
    console.error('[RedefinirSenha] Falha ao consultar estudio_membros:', membroErr);
    return '/login';
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
