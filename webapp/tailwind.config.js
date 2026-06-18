/** @type {import('tailwindcss').Config} */
// ─── Midnight Indigo · tailwind.config.js ────────────────────────────────────
// Mapeia TODOS os tokens CSS → classes utilitárias Tailwind.
// Regra: nunca hard-code cores aqui. Tudo via hsl(var(--token)).
// ─────────────────────────────────────────────────────────────────────────────

export default {
  darkMode: ['class'],

  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },

    extend: {
      /* ── Cores ─────────────────────────────────────────────────────────── */
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        subtle:     'hsl(var(--subtle))',

        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow:       'hsl(var(--primary-glow))',
          soft:       'hsl(var(--primary) / 0.12)',
        },

        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },

        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          soft:       'hsl(var(--destructive) / 0.12)',
        },

        success: {
          DEFAULT:    'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft:       'hsl(var(--success) / 0.12)',
        },

        warning: {
          DEFAULT:    'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft:       'hsl(var(--warning) / 0.12)',
        },

        info: {
          DEFAULT:    'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          soft:       'hsl(var(--info) / 0.12)',
        },

        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },

        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        /* Sidebar — tokens dedicados para não vazar no resto da UI */
        sidebar: {
          DEFAULT:             'hsl(var(--sidebar))',
          foreground:          'hsl(var(--sidebar-foreground))',
          border:              'hsl(var(--sidebar-border))',
          accent:              'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          primary:             'hsl(var(--sidebar-primary))',
          'primary-foreground':'hsl(var(--sidebar-primary-foreground))',
          'muted-foreground':  'hsl(var(--sidebar-muted-foreground))',
        },
      },

      /* ── Raios ──────────────────────────────────────────────────────────── */
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 16px)',
      },

      /* ── Tipografia ─────────────────────────────────────────────────────── */
      fontFamily: {
        sans:    ['DM Sans', 'ui-sans-serif', 'system-ui'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui'],
      },

      /* ── Gradientes ─────────────────────────────────────────────────────── */
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-hero':    'var(--gradient-hero)',
      },

      /* ── Sombras ────────────────────────────────────────────────────────── */
      boxShadow: {
        elegant: 'var(--shadow-elegant)',
        glow:    'var(--shadow-glow)',
        card:    'var(--shadow-card)',
        brand:   'var(--shadow-brand)',
      },

      /* ── Animações ──────────────────────────────────────────────────────── */
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.4s ease-out',
        'scale-in':      'scale-in 0.2s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
      },
    },
  },

  plugins: [
    // tailwindcss-animate é importado via @plugin no CSS (Tailwind v4)
    // mas mantemos aqui para compatibilidade com v3 se necessário
  ],
};
