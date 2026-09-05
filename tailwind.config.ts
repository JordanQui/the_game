import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        /**
         * Blanc d'os froid. Le crème parcheminé d'avant tirait l'interface vers
         * le grimoire ; le Dark Deco est peint sur noir, pas sur du vélin.
         * Le nom reste : il est utilisé partout et ce n'est que le jeton clair.
         */
        parchment: '#e9ecf1',
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        /**
         * Noir bleuté, pas brun. C'est la dominante de l'image fixe de l'auberge
         * (#0E1420) : l'interface et l'illustration doivent tenir ensemble.
         */
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
        },
        /** Le ton moyen de la palette : l'architecture en lumière indirecte. */
        steel: {
          400: 'rgb(var(--steel-400) / <alpha-value>)',
          500: 'rgb(var(--steel-500) / <alpha-value>)',
          600: 'rgb(var(--steel-600) / <alpha-value>)',
          700: 'rgb(var(--steel-700) / <alpha-value>)',
        },
        /**
         * L'accent : le néon. Teinte volontairement éloignée des bleus sur la
         * roue chromatique, sans quoi il se noierait dans la dominante.
         */
        neon: {
          200: 'rgb(var(--neon-200) / <alpha-value>)',
          300: 'rgb(var(--neon-300) / <alpha-value>)',
          400: 'rgb(var(--neon-400) / <alpha-value>)',
          500: 'rgb(var(--neon-500) / <alpha-value>)',
          600: 'rgb(var(--neon-600) / <alpha-value>)',
          700: 'rgb(var(--neon-700) / <alpha-value>)',
        },
      },
      fontFamily: {
        /** Titres et boutons : géométrique, capitales, interlettrage large. */
        display: ['Futura', '"Avenir Next"', '"Century Gothic"', '"Trebuchet MS"', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        /** Conservé pour la narration en jeu, qui se lit comme un roman. */
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fade-in 0.8s ease-out forwards',
        /** Respiration lente d'un néon Deco : opacité seule, jamais de flou. */
        'deco-pulse': 'deco-pulse 3.2s ease-in-out infinite',
        /** Rotation très lente de l'éventail de rayons. */
        'deco-turn': 'deco-turn 60s linear infinite',
        /** Grésillement de tube néon : irrégulier, très bref, jamais clignotant. */
        'neon-buzz': 'neon-buzz 7s steps(1, end) infinite',
        /** Averse de mégapole : traits verticaux qui tombent. */
        'rain-fall': 'rain-fall 0.9s linear infinite',
      },
      keyframes: {
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'deco-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'deco-turn': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'neon-buzz': {
          '0%, 96%, 100%': { opacity: '1' },
          '97%': { opacity: '0.35' },
          '98%': { opacity: '1' },
          '99%': { opacity: '0.55' },
        },
        'rain-fall': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
} satisfies Config
