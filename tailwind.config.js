/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Snow Snow Branding
        // Sakura Blossom Palette
        theme: {
          navy: '#5c1f3d',      // Deep Plum-Rose - Headers, footer, dark sections
          blue: '#f48ab0',      // Sakura Pink - Buttons, highlights, links
          lightblue: '#fbbdd6', // Soft Blossom - Section backgrounds, cards
          white: '#FFFFFF',     // Snow White - Text areas, forms
          red: '#e11d48',       // Warm "live" accent (used intentionally)
        },
        // Semantic mappings (backward compatibility + new structure)
        'theme-bg': '#fff1f6',          // Main content background (Blossom wash)
        'theme-navy': '#5c1f3d',        // Dark sections
        'theme-text': '#4a1730',        // Plum ink (high contrast on blossom)
        'theme-text-light': '#FFFFFF',  // White text for dark backgrounds
        'theme-accent': '#f774a8',      // Blossom pink accent
        'theme-secondary': '#e0588e',   // Sakura deep
        'theme-soft-blue': '#fbbdd6',   // Soft Blossom

        // Mapping standard colors to the new theme for compatibility
        primary: {
          50: '#fff1f6',
          100: '#ffe7f0',
          200: '#fbbdd6',
          300: '#f9a9c8',
          400: '#f774a8',
          500: '#f48ab0', // Main Sakura Pink
          600: '#e0588e',
          700: '#c33f70',
          800: '#8d3a5f',
          900: '#5c1f3d',
        },
        // Sakura deep for secondary
        secondary: {
          50: '#fff1f6',
          100: '#ffe0ec',
          200: '#fbbdd6',
          300: '#f79ac0',
          400: '#ef7aa5',
          500: '#e0588e',
          600: '#c33f70',
          700: '#a23158',
          800: '#8d3a5f',
          900: '#5c1f3d',
        },
        accent: {
          light: '#fbbdd6',
          DEFAULT: '#f774a8',
          dark: '#e0588e',
          white: '#ffffff',
          black: '#5c1f3d',
        },
      },
      fontFamily: {
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        inter: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        jp: ['Shippori Mincho B1', 'Sora', 'serif'],
      },
      backdropBlur: {
        frost: '18px',
      },
      borderRadius: {
        'frost-lg': '26px',
        'frost-md': '18px',
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'medium': '0 4px 15px rgba(0, 0, 0, 0.05)',
        'hover': '0 8px 25px rgba(0, 0, 0, 0.08)',
        'frost': '0 22px 50px -24px rgba(140, 40, 90, .4), 0 2px 0 rgba(255, 255, 255, .7) inset',
        'frost-soft': '0 14px 34px -20px rgba(140, 40, 90, .35)',
        'glow': '0 0 0 1px rgba(255, 255, 255, .6), 0 14px 40px -14px rgba(247, 116, 168, .6)',
      },
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-out',
        'slideIn': 'slideIn 0.4s ease-out',
        'slideUp': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(5px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
