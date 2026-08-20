// Nível 2 (cor de marca customizável): o banco só guarda duas cores
// (`cor_primaria`, `cor_secundaria`), mas o landing.css já usa 6 variáveis
// (--pri, --pri-d, --pri-l, --sec, --sec-d, --sec-l) espalhadas em dezenas
// de regras. Em vez de reescrever o CSS todo, geramos as variações
// claro/escuro programaticamente a partir das duas cores base e
// sobrescrevemos as CSS vars em runtime no elemento raiz da landing.
//
// Também calculamos --pri-text/--sec-text (heurística simples de
// luminância) para garantir contraste legível quando o estúdio escolhe
// uma cor de marca muito clara — os botões usam `color: var(--pri-text, #fff)`
// no CSS, então o fallback pro branco se mantém quando a var não é definida.

const REGEX_HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

function normalizarHex(hex) {
  if (typeof hex !== 'string') return null;
  const valor = hex.trim();
  return REGEX_HEX_COLOR.test(valor) ? valor : null;
}

function hexParaRgb(hex) {
  const inteiro = parseInt(hex.slice(1), 16);
  return {
    r: (inteiro >> 16) & 255,
    g: (inteiro >> 8) & 255,
    b: inteiro & 255,
  };
}

function rgbParaHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// percentual positivo clareia, negativo escurece (mistura com branco/preto)
function sombrear(hex, percentual) {
  const { r, g, b } = hexParaRgb(hex);
  const alvo = percentual > 0 ? 255 : 0;
  const p = Math.abs(percentual);
  return rgbParaHex({
    r: r + (alvo - r) * p,
    g: g + (alvo - g) * p,
    b: b + (alvo - b) * p,
  });
}

// Luminância relativa simplificada (WCAG-like, sem correção gama completa —
// suficiente para decidir texto claro vs escuro, não para compliance formal).
function luminanciaRelativa(hex) {
  const { r, g, b } = hexParaRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function corDeTextoContraste(hex) {
  return luminanciaRelativa(hex) > 0.6 ? '#1f2937' : '#ffffff';
}

/**
 * Monta o objeto de `style` (CSS custom properties) para sobrescrever a
 * paleta da landing em runtime. Retorna `null` quando o estúdio não
 * customizou nenhuma cor — nesse caso, o chamador deve simplesmente não
 * aplicar `style` nenhum, e os defaults fixos do landing.css valem.
 *
 * @param {string|null|undefined} corPrimaria
 * @param {string|null|undefined} corSecundaria
 */
export function montarCssVarsMarca(corPrimaria, corSecundaria) {
  const pri = normalizarHex(corPrimaria);
  const sec = normalizarHex(corSecundaria);

  if (!pri && !sec) return null;

  const vars = {};

  if (pri) {
    vars['--pri'] = pri;
    vars['--pri-d'] = sombrear(pri, -0.18);
    vars['--pri-l'] = sombrear(pri, 0.35);
    vars['--pri-text'] = corDeTextoContraste(pri);
  }

  if (sec) {
    vars['--sec'] = sec;
    vars['--sec-d'] = sombrear(sec, -0.18);
    vars['--sec-l'] = sombrear(sec, 0.35);
    vars['--sec-text'] = corDeTextoContraste(sec);
  }

  return vars;
}