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
  // exact: true — desde a PED-111 (login com Google), a página também tem
  // um botão "Entrar com Google"; sem exact, o match por substring de
  // 'Entrar' resolve pros dois botões (strict mode violation).
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  // Timeout generoso de propósito (PED-72): o redirect pra /dashboard só
  // acontece depois do signInWithPassword + resolução de perfil (useAuth) —
  // chamadas reais contra o projeto de staging, então sob CI/runner
  // carregado (fullyParallel) a latência varia mais do que localmente.
  // A causa raiz de round-trips sequenciais evitáveis foi corrigida em
  // useAuth.jsx (Promise.all); esta margem cobre a variação de rede/CI
  // residual que continua sendo inerente a bater num backend real.
  //
  // PED-87: `toHaveURL` sozinho continuou flaky mesmo após o fix da PED-72
  // (2 recorrências em runs sem nenhuma mudança de auth/routing/frontend).
  // Espera pelo heading real do Dashboard em vez de só a URL mudar — o
  // heading renderiza assim que o componente monta, sem depender das
  // queries de dados do dashboard (que têm seus próprios skeletons), então
  // é um sinal mais direto de "login concluído e SPA navegou" do que a URL
  // isolada, que pode mudar antes do React terminar de montar a rota nova.
  await expect(page.getByRole('heading', { name: 'Painel de Avisos' })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page).toHaveURL(urlFor(host, '/dashboard'));
}
