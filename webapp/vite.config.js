/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// PED-149: sem source maps, toda issue de produção no Sentry chega com
// nomes minificados (ex.: "Xe" em vez de "limparCepErro" no caso do
// PED-97), tornando a causa raiz quase impossível de achar sem reler o
// bundle à mão. SENTRY_AUTH_TOKEN só existe no ambiente de Production da
// Vercel (nunca em build local/CI/Preview — mesma lógica de escopo já
// usada para VITE_SENTRY_DSN, ver .env.example) — sem o token, o plugin
// nem entra no array de plugins nem liga sourcemap, então build local/CI
// e Preview deployments continuam exatamente como hoje (sem .map nenhum).
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

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
export function swCacheVersionPlugin() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? String(Date.now());
  let root;
  let outDir;
  return {
    name: 'sw-cache-version',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const caminho = resolve(root, outDir, 'sw.js');
      if (!existsSync(caminho)) {
        // Antes retornava em silêncio: se o build algum dia rodar de outro
        // cwd ou com build.outDir customizado, o sw.js deployado ficava com
        // o literal %%CACHE_VERSION%% pra sempre, sem o build "quebrar" em
        // lugar nenhum (PED-60). this.error interrompe o build de propósito.
        this.error(`sw-cache-version: ${caminho} não encontrado — CACHE_VERSION não foi substituído em sw.js.`);
        return;
      }
      // Restrito às linhas `const ..._NAME = ...`: um replaceAll sobre o
      // arquivo inteiro também atingiria o token %%CACHE_VERSION%% citado
      // no comentário explicativo acima, corrompendo-o (PED-59).
      const conteudo = readFileSync(caminho, 'utf-8').replace(
        /^(const (?:CACHE_NAME|STATIC_CACHE_NAME) = .*)$/gm,
        (linha) => linha.replaceAll('%%CACHE_VERSION%%', versao)
      );
      writeFileSync(caminho, conteudo);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    swCacheVersionPlugin(),
    // Sentry Vite plugin precisa vir depois dos demais plugins (recomendação
    // oficial: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/).
    sentryAuthToken &&
      sentryVitePlugin({
        org: 'dev-pedro-schuster',
        project: 'nexofy-web',
        authToken: sentryAuthToken,
        sourcemaps: {
          // "hidden" (abaixo, em build.sourcemap) não referencia o .map no
          // bundle servido — combinado com filesToDeleteAfterUpload, o .map
          // é só um artefato de build local que sobe pro Sentry e nunca
          // chega ao usuário final.
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
  ].filter(Boolean),

  build: {
    // "hidden": gera o .map mas SEM o comentário `//# sourceMappingURL=`
    // no JS final — o navegador nunca tenta buscá-lo, só o Sentry o usa
    // (via upload). Só liga quando o token existe (build de Production na
    // Vercel); build local/CI/Preview continuam sem sourcemap nenhum.
    sourcemap: sentryAuthToken ? 'hidden' : false,
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