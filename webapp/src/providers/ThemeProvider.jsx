// src/providers/ThemeProvider.jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

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

function resolveTheme(theme) {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function ThemeProvider({ children, defaultTheme = DEFAULT_THEME }) {
  const [theme, setThemeState] = useState(() => safeGetStoredTheme(defaultTheme));
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(safeGetStoredTheme(defaultTheme)));

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
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