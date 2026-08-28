/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Substitui %%CACHE_VERSION%% em dist/sw.js depois do build. O Vite copia
// public/sw.js pra dist/ sem processar (comportamento padrão de arquivos
// em public/) — por isso o replace acontece manualmente aqui, em
// closeBundle. Usa closeBundle (não writeBundle) de propósito: a cópia de
// public/ não é um passo do pipeline de plugins do Rollup, então a ordem
// dela em relação a um writeBundle de plugin não é garantida; closeBundle
// é o hook que a própria documentação do Vite recomenda pra pós-processar
// arquivos de output porque só roda depois que tudo — incluindo a cópia
// de public/ — já terminou. SHA do commit em produção (a Vercel injeta
// VERCEL_GIT_COMMIT_SHA em todo build) porque amarra a versão da cache à
// revisão de código real, não a um horário; timestamp como fallback pra
// build local, onde essa env var não existe.
function swCacheVersionPlugin() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? String(Date.now());
  return {
    name: 'sw-cache-version',
    closeBundle() {
      const caminho = resolve(process.cwd(), 'dist', 'sw.js');
      if (!existsSync(caminho)) return;
      const conteudo = readFileSync(caminho, 'utf-8').replaceAll('%%CACHE_VERSION%%', versao);
      writeFileSync(caminho, conteudo);
    },
  };
}

export default defineConfig({
  plugins: [react(), swCacheVersionPlugin()],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react-router-dom') ||
              id.includes('react-dom') ||
              (id.includes('react') &&
                !id.includes('react-big-calendar') &&
                !id.includes('react-hot-toast'))
            ) {
              return 'react-vendor';
            }
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@tanstack')) return 'query';
            if (id.includes('lucide-react') || id.includes('react-hot-toast')) return 'ui';
            if (id.includes('react-big-calendar') || id.includes('date-fns')) return 'calendar';
            if (id.includes('recharts')) return 'charts';
          }
        },
      },
    },
  },

  preview: {
    // Deve ficar em sincronia com TENANT_A_HOST/TENANT_B_HOST em
    // webapp/e2e/constants.js e com as entradas de /etc/hosts em
    // .github/workflows/ci.yml (job `e2e`).
    allowedHosts: ['iluminus.e2e.test', 'ronaldo.e2e.test'],
  },
});