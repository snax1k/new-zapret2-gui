/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0B0F19',
          card: '#111827',
          surface: '#1E293B',
          glass: 'rgba(15, 23, 42, 0.75)',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        accent: {
          green: '#10B981',
          cyan: '#06B6D4',
          amber: '#F59E0B',
          rose: '#F43F5E',
          purple: '#A855F7',
        }
      },
      boxShadow: {
        'glow-green': '0 0 35px -5px rgba(16, 185, 129, 0.45)',
        'glow-indigo': '0 0 35px -5px rgba(99, 102, 241, 0.45)',
        'glow-red': '0 0 35px -5px rgba(244, 63, 94, 0.35)',
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
