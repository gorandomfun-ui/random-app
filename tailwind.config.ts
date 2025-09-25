/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'theme-1-bg': '#f8c021',
        'theme-1-accent': '#ff3500',
        'theme-2-bg': '#ff7a3b',
        'theme-2-accent': '#b90045',
        'theme-3-bg': '#347ad9',
        'theme-3-accent': '#0013a4',
        'theme-4-bg': '#ff3500',
        'theme-4-accent': '#ffc300',
        'theme-5-bg': '#00d440',
        'theme-5-accent': '#007861',
        'theme-6-bg': '#7706b2',
        'theme-6-accent': '#4ecc7f',
      },
      fontFamily: {
        'tomorrow': ['Tomorrow', 'sans-serif'],
        'inter-tight': ['Inter Tight', 'sans-serif'],
      },
      animation: {
        'pulse-scale': 'pulseScale 0.5s ease-in-out',
        'glow-sweep': 'glowSweep 0.5s ease-out',
        'bounce-soft': 'bounceSoft 0.6s ease-out',
      },
      keyframes: {
        pulseScale: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
        glowSweep: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '25%': { transform: 'translateY(-10px)' },
          '50%': { transform: 'translateY(-5px)' },
          '75%': { transform: 'translateY(-2px)' },
        },
      },
    },
  },
  plugins: [],
}
