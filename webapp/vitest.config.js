import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // e2e/** roda sob o Playwright (webapp/playwright.config.js), não o
    // Vitest — os dois usam a convenção *.spec.js e sem essa exclusão o
    // Vitest tenta importar os testes do Playwright, que dependem de
    // `@playwright/test` e quebram sob o runner do Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
