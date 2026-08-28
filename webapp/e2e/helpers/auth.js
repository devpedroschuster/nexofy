import { expect } from '@playwright/test';
import { urlFor } from '../constants.js';

/**
 * Faz login como admin e espera o redirect pro dashboard.
 * Não valida toast de sucesso — o texto exato não é o que importa aqui
 * (era motivo de flakiness antes do PED-46 corrigir o toast de erro
 * espúrio pra admins vinculados só via estudio_membros). O sinal
 * confiável de login bem-sucedido é a URL mudar.
 *
 * Se `nomeEstudio` for passado, valida (antes de preencher credenciais)
 * que o heading da tela de login mostra "Entrar em {nomeEstudio}" — isso
 * prova que o subdomínio simulado (host) realmente resolveu pro estúdio
 * esperado, tornando a simulação de tenant por subdomínio parte real da
 * asserção (e não só um detalhe de infraestrutura sem efeito no teste).
 */
export async function loginComoAdmin(page, host, email, password, nomeEstudio) {
  await page.goto(urlFor(host, '/login'));

  if (nomeEstudio) {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(nomeEstudio, {
      timeout: 15_000,
    });
  }

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Timeout generoso de propósito (PED-72): o redirect pra /dashboard só
  // acontece depois do signInWithPassword + resolução de perfil (useAuth) —
  // chamadas reais contra o projeto de staging, então sob CI/runner
  // carregado (fullyParallel) a latência varia mais do que localmente.
  // A causa raiz de round-trips sequenciais evitáveis foi corrigida em
  // useAuth.jsx (Promise.all); esta margem cobre a variação de rede/CI
  // residual que continua sendo inerente a bater num backend real.
  await expect(page).toHaveURL(urlFor(host, '/dashboard'), { timeout: 25_000 });
}
