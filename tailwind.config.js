/** @type {import('tailwindcss').Config} */
const ramp = (prefix) => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(s => [s, `rgb(var(--${prefix}-${s}) / <alpha-value>)`])
);

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Палитры из CSS-переменных — их ставит src/lib/theme.ts.
        //
        // indigo и slate — для старых компонентов: их почти девятьсот
        // классов, подменить палитру дешевле, чем править каждый. Формат
        // «R G B» без rgb() нужен для модификатора прозрачности: bg-indigo-600/20.
        indigo: ramp('accent'),
        slate: ramp('surface'),

        // Токены редизайна 0.4.3 — новые компоненты пишутся ими.
        app: 'rgb(var(--c-bg) / <alpha-value>)',
        s1: 'rgb(var(--c-s1) / <alpha-value>)',
        s2: 'rgb(var(--c-s2) / <alpha-value>)',
        s3: 'rgb(var(--c-s3) / <alpha-value>)',
        t1: '#EDEDEF',
        t2: '#A1A1AA',
        t3: '#6B6B76',
        ac: {
          DEFAULT: 'rgb(var(--accent-500) / <alpha-value>)',
          ...ramp('accent'),
        },
      },
      borderColor: {
        line: 'rgb(255 255 255 / var(--c-line))',
        'line-strong': 'rgb(255 255 255 / var(--c-line-strong))',
      },
      fontFamily: {
        // Приложение работает офлайн — шрифты системные: Segoe UI Variable
        // на Windows 11, Segoe UI на Windows 10. Моноширинный — Cascadia
        // (Windows Terminal), иначе Consolas.
        sans: ['"Segoe UI Variable Text"', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', '"Cascadia Code"', 'Consolas', '"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 35px -5px rgba(34, 197, 94, 0.45)',
        'glow-indigo': '0 0 35px -5px rgb(var(--accent-500) / 0.45)',
        'glow-red': '0 0 35px -5px rgba(239, 68, 68, 0.35)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
