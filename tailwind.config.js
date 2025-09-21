/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter-tight)'],
        tomorrow: ['var(--font-tomorrow)'],
      },
      colors: {
        brand: {
          bg: '#347ad9',
          deep: '#0013a4',
          cream: '#f8f6ea',
        },
      },
      keyframes: {
        slideUp:   { '0%':{transform:'translateY(24px)',opacity:'0'}, '100%':{transform:'translateY(0)',opacity:'1'} },
        slideLeft: { '0%':{transform:'translateX(24px)',opacity:'0'}, '100%':{transform:'translateX(0)',opacity:'1'} },
        slideRight:{ '0%':{transform:'translateX(-24px)',opacity:'0'}, '100%':{transform:'translateX(0)',opacity:'1'} },
        pop:       { '0%':{transform:'scale(.85)',opacity:'0'}, '100%':{transform:'scale(1)',opacity:'1'} },
        rotateIn:  { '0%':{transform:'rotate(-8deg)',opacity:'0'}, '100%':{transform:'rotate(0)',opacity:'1'} },
        skewIn:    { '0%':{transform:'skewY(6deg)',opacity:'0'}, '100%':{transform:'skewY(0)',opacity:'1'} },
      },
      animation: {
        slideUp: 'slideUp .35s ease-out',
        slideLeft: 'slideLeft .35s ease-out',
        slideRight: 'slideRight .35s ease-out',
        pop: 'pop .35s ease-out',
        rotateIn: 'rotateIn .35s ease-out',
        skewIn: 'skewIn .35s ease-out',
      },
    },
  },
  plugins: [],
}
