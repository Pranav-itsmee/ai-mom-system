import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        sans:   ['var(--font-outfit)', 'Outfit', 'sans-serif'],
      },
      fontSize: {
        'theme-xs': ['12px', { lineHeight: '18px' }],
        'theme-sm': ['14px', { lineHeight: '20px' }],
        'theme-xl': ['20px', { lineHeight: '30px' }],
      },
      colors: {
        // Brand — fixed hex values so opacity modifiers work (bg-primary/10 etc.)
        primary: '#00C9A7',
        accent:  '#FF6B6B',
        warning: '#F79009',
        // Surface tokens via CSS variables (no opacity modifiers used)
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        border:  'var(--border)',
        // Gray scale
        gray: {
          25:  '#FCFCFD',
          50:  '#F9FAFB',
          100: '#F2F4F7',
          200: '#E4E7EC',
          300: '#D0D5DD',
          400: '#98A2B3',
          500: '#667085',
          600: '#475467',
          700: '#344054',
          800: '#1D2939',
          900: '#101828',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'theme-xs': 'var(--shadow-xs)',
        'theme-sm': 'var(--shadow-sm)',
        'theme-md': 'var(--shadow-md)',
        'theme-lg': 'var(--shadow-lg)',
        'theme-xl': 'var(--shadow-xl)',
      },
    },
  },
  plugins: [],
};

export default config;
