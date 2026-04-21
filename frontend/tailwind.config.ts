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
        inter: ['Inter', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        sans:  ['Inter', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs':  ['12px', { lineHeight: '18px' }],
        'sm':  ['13px', { lineHeight: '20px' }],
        'base':['14px', { lineHeight: '22px' }],
        'md':  ['15px', { lineHeight: '24px' }],
        'lg':  ['16px', { lineHeight: '26px' }],
        'xl':  ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '30px' }],
        '3xl': ['24px', { lineHeight: '34px' }],
        // Legacy aliases
        'theme-xs': ['12px', { lineHeight: '18px' }],
        'theme-sm': ['14px', { lineHeight: '20px' }],
        'theme-xl': ['20px', { lineHeight: '30px' }],
      },
      colors: {
        // Brand — fixed hex so opacity modifiers work (bg-primary/10, etc.)
        primary:   '#B4D3D9',   /* soft teal */
        secondary: '#BDA6CE',   /* soft purple */
        accent:    '#9B8EC7',   /* deeper purple */
        warning:   '#F59E0B',
        danger:    '#EF4444',
        success:   '#22C55E',
        info:      '#3B82F6',

        // Semantic surfaces via CSS variables
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        border:    'var(--border)',
      },
      borderRadius: {
        DEFAULT: '8px',
        'sm':  '6px',
        'md':  '10px',
        'lg':  '12px',
        'xl':  '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        'theme-xs': 'var(--shadow-xs)',
        'theme-sm': 'var(--shadow-sm)',
        'theme-md': 'var(--shadow-md)',
        'theme-lg': 'var(--shadow-lg)',
        'theme-xl': 'var(--shadow-xl)',
      },
      spacing: {
        '18': '72px',
        '22': '88px',
        '72': '288px',
        '80': '320px',
        sidebar:           'var(--sidebar-w)',
        'sidebar-collapsed': 'var(--sidebar-w-collapsed)',
        topbar:            'var(--topbar-h)',
      },
      transitionTimingFunction: {
        'ease-spring': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1' },
        },
        'slide-left': {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in':  'fade-in 0.25s ease both',
        'scale-in': 'scale-in 0.2s ease both',
        'slide-left': 'slide-left 0.25s ease both',
      },
    },
  },
  plugins: [],
};

export default config;
