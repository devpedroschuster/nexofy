import { expect } from '@playwright/test';
import { urlFor } from '../constants.js';

/**
 * Faz login como admin e espera o redirect pro dashboard.
 * Não valida toast de sucesso — ver nota no plano do PED-26 sobre o
 * toast de erro espúrio pra admins vinculados só via estudio_membros
 * (PED-46). O sinal confiável de login bem-sucedido é a URL mudar.
 */
export async function loginComoAdmin(page, host, email, password) {
  await page.goto(urlFor(host, '/login'));
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(urlFor(host, '/dashboard'), { timeout: 15_000 });
}
