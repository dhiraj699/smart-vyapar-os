/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Hind', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#16231B',
        sage: { 50: '#F3F5F1', 100: '#E7ECE3', 200: '#D3DBCD', 300: '#B7C3AF', 500: '#6B7C6A' },
        leaf: { DEFAULT: '#1F5F3F', dark: '#17482F', light: '#DDEBE3' },
        haldi: { DEFAULT: '#E8A200', dark: '#C98B00', light: '#FFF1CC' },
        chilli: { DEFAULT: '#C8321F', dark: '#A12615', light: '#FBE3DF' },
      },
    },
  },
  plugins: [],
};
