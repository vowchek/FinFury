/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // «Узкий» банковский UI: центрированная колонка
      maxWidth: {
        app: '28rem',
      },
    },
  },
  plugins: [],
};