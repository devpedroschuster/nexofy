// src/providers/ThemeProvider.jsx
import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY   = 'midnight-theme';
const DEFAULT_THEME  = 'dark';

const ThemeContext = createContext(null);

function safeGetStoredTheme(fallback) {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeSystemTheme(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function resolveTheme(theme, systemTheme) {
  return theme === 'system' ? systemTheme : theme;
}

export function ThemeProvider({ children, defaultTheme = DEFAULT_THEME }) {
  const [theme, setThemeState] = useState(() => safeGetStoredTheme(defaultTheme));
  // Assina o media query do SO em vez de copiar o valor pra um state
  // sincronizado via effect — evita o re-render extra e o setState
  // síncrono dentro de effect que isso causava.
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => 'light');
  const resolvedTheme = resolveTheme(theme, systemTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* safari private mode */ }
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