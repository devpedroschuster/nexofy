import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

if (import.meta.env.DEV) {
  console.log('[main.jsx] v2 carregado ✅')
}

if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Failed to fetch dynamically imported module',
      'Loading chunk',
    ],
  })
  window.Sentry = Sentry
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaInstallPrompt = e
}, { once: true })

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        if (import.meta.env.DEV) console.log('[SW] Registrado ✅', reg.scope)
      })
      .catch(err => {
        console.error('[SW] Erro ao registrar:', err)
      })
  })
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  document.body.innerHTML =
    '<div style="padding:24px;font-family:sans-serif">Erro crítico: elemento #root não encontrado. Recarregue a página ou contate o suporte.</div>'
  throw new Error('[main.jsx] Elemento #root não encontrado no DOM.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)