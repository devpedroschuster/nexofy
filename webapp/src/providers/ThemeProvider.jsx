// src/providers/ThemeProvider.jsx
// ─── Midnight Indigo · ThemeProvider ─────────────────────────────────────────
//
// Suporta três modos: 'light' | 'dark' | 'system'
// - Persiste em localStorage sob a chave 'midnight-theme'
// - Aplica a classe 'dark' no <html> conforme o tema resolvido
// - Respeita prefers-color-scheme quando em modo 'system'
// - Escuta mudanças do sistema em tempo real (ex: usuário muda o SO p/ dark)
//
// Uso:
//   const { theme, setTheme, resolvedTheme } = useTheme();
//   theme          → 'light' | 'dark' | 'system'  (preferência salva)
//   resolvedTheme  → 'light' | 'dark'              (tema efetivo aplicado)
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY  = 'midnight-theme';
const DEFAULT_THEME = 'dark'; // Midnight Indigo nasce escuro

const ThemeContext = createContext(null);

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme) {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

export function ThemeProvider({ children, defaultTheme = DEFAULT_THEME }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(localStorage.getItem(STORAGE_KEY) ?? defaultTheme)
  );

  /* Aplica a classe 'dark' no <html> e atualiza resolvedTheme */
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [theme]);

  /* Escuta mudanças de tema do sistema (apenas quando em modo 'system') */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        document.documentElement.classList.toggle('dark', resolved === 'dark');
      }
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* safari private */ }
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>');
  return ctx;
}
