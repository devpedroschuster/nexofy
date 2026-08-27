import { defineConfig, devices } from '@playwright/test';
import { PORT } from './e2e/constants.js';

// Pré-requisitos para rodar localmente (npm run e2e):
// - Entradas em /etc/hosts apontando os dois hostnames de tenant simulados
//   (ver TENANT_A_HOST/TENANT_B_HOST em e2e/constants.js) para 127.0.0.1.
// - VITE_ROOT_DOMAINS=e2e.test, VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY
//   (projeto de staging) e as credenciais E2E_ADMIN_A_*/E2E_ADMIN_B_* como
//   env vars ANTES de `npm run build` — como reuseExistingServer é true
//   fora do CI, um build antigo feito sem essas vars será reutilizado
//   silenciosamente em vez de dar erro.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
