import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['e2e/**/*.js', 'playwright.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ignoreRestSiblings: permite o idioma `const { a, b, ...rest } = obj`
      // quando `a`/`b` só existem para ficarem de fora de `rest`.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
      // Sem isso, no-unused-vars não reconhece uma variável usada apenas
      // como tag JSX (ex.: const { Icon } = ...; <Icon />) como "usada".
      'react/jsx-uses-vars': 'error',
      // Hooks e helpers que hoje vivem no mesmo arquivo que o componente/
      // provider relacionado (padrão já estabelecido no projeto). Fast
      // Refresh continua funcionando para o componente; só perde o reload
      // "quente" desse export específico.
      'react-refresh/only-export-components': ['error', {
        allowExportNames: [
          'useAuth',
          'useImpersonation',
          'isErroAcessoNegado',
          'useTheme',
          'useModal',
          'inputBaseClass',
          'renderCelula',
          'showToast',
          'ICONES_ESPACO',
        ],
      }],
    },
  },
])
