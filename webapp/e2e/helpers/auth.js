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
  await expect(page).toHaveURL(urlFor(host, '/dashboard'), { timeout: 15_000 });
}
