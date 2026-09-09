/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // «Киберпанк-приборная панель»: индиго-фон, неон, циан.
        night: '#0B0E1A',
        panel: '#131A2B',
        edge: '#22304F',
        ghost: '#E9ECF5',
        mute: '#8B94B3',
        neon: '#FF2E88',
        cyber: '#2FE0FF',
        amber: '#FFB020',
      },
      fontFamily: {
        display: ['Michroma', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      maxWidth: {
        // Узкая колонка, но не слишком: ~960px.
        page: '60rem',
        // «Узкий» банковский UI: центрированная колонка
        app: '28rem',
      },
    },
  },
  plugins: [],
};