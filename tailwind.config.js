/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: v('paper'),
        surface: v('surface'),
        raised: v('raised'),
        ink: v('ink'),
        ink2: v('ink-2'),
        ink3: v('ink-3'),
        line: v('line'),
        accent: v('accent'),
        pos: v('pos'),
        warn: v('warn')
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif']
      },
      borderRadius: {
        '4xl': '2rem'
      }
    }
  },
  plugins: []
};
