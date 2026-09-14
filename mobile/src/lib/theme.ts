import { create } from 'zustand';
import type { Estudio } from '@/types';

// Port de webapp/src/lib/corMarca.js — mesma heurística de sombreado/contraste,
// adaptada pra gerar um objeto de tokens (RN não tem CSS custom properties).
const REGEX_HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

function normalizarHex(hex?: string | null): string | null {
  if (typeof hex !== 'string') return null;
  const valor = hex.trim();
  return REGEX_HEX_COLOR.test(valor) ? valor : null;
}

function hexParaRgb(hex: string) {
  const inteiro = parseInt(hex.slice(1), 16);
  return { r: (inteiro >> 16) & 255, g: (inteiro >> 8) & 255, b: inteiro & 255 };
}

function rgbParaHex({ r, g, b }: { r: number; g: number; b: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sombrear(hex: string, percentual: number): string {
  const { r, g, b } = hexParaRgb(hex);
  const alvo = percentual > 0 ? 255 : 0;
  const p = Math.abs(percentual);
  return rgbParaHex({ r: r + (alvo - r) * p, g: g + (alvo - g) * p, b: b + (alvo - b) * p });
}

function luminanciaRelativa(hex: string): number {
  const { r, g, b } = hexParaRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function corDeTextoContraste(hex: string): string {
  return luminanciaRelativa(hex) > 0.6 ? '#1f2937' : '#ffffff';
}

export interface ThemeTokens {
  pri: string;
  priDark: string;
  priLight: string;
  priText: string;
  sec: string;
  secDark: string;
  secLight: string;
  secText: string;
  logoUrl: string | null;
}

// Identidade visual do próprio Nexofy ("Midnight Indigo", webapp/src/index.css)
// — usada como "carinha" enquanto o estúdio não define a própria marca.
// #FFD600 é só o default da coluna estudios.cor_primaria no banco (nunca uma
// escolha de marca real de ninguém), então também conta como "não configurado".
const NEXOFY_PRI = '#4F46E5';
const NEXOFY_SEC = '#0A0A1A';
const COR_PLACEHOLDER_BANCO = '#FFD600';

const TOKENS_PADRAO: ThemeTokens = {
  pri: NEXOFY_PRI,
  priDark: sombrear(NEXOFY_PRI, -0.18),
  priLight: sombrear(NEXOFY_PRI, 0.35),
  priText: corDeTextoContraste(NEXOFY_PRI),
  sec: NEXOFY_SEC,
  secDark: sombrear(NEXOFY_SEC, -0.18),
  secLight: sombrear(NEXOFY_SEC, 0.35),
  secText: corDeTextoContraste(NEXOFY_SEC),
  logoUrl: null,
};

interface ThemeStore {
  tokens: ThemeTokens;
  aplicarTemaDoEstudio: (estudio: Pick<Estudio, 'cor_primaria' | 'cor_secundaria' | 'logo_url'>) => void;
  resetarTema: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  tokens: TOKENS_PADRAO,
  aplicarTemaDoEstudio: (estudio) => {
    const corPrimariaConfigurada =
      estudio.cor_primaria && estudio.cor_primaria !== COR_PLACEHOLDER_BANCO ? estudio.cor_primaria : null;

    const pri = normalizarHex(corPrimariaConfigurada) ?? TOKENS_PADRAO.pri;
    const sec = normalizarHex(estudio.cor_secundaria) ?? TOKENS_PADRAO.sec;
    set({
      tokens: {
        pri,
        priDark: sombrear(pri, -0.18),
        priLight: sombrear(pri, 0.35),
        priText: corDeTextoContraste(pri),
        sec,
        secDark: sombrear(sec, -0.18),
        secLight: sombrear(sec, 0.35),
        secText: corDeTextoContraste(sec),
        logoUrl: estudio.logo_url ?? null,
      },
    });
  },
  resetarTema: () => set({ tokens: TOKENS_PADRAO }),
}));
