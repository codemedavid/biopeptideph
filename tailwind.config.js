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
        // Frosted-Ice Palette
        theme: {
          navy: '#0c2c4a',      // Deep Glacier - Headers, footer, dark sections
          blue: '#3ea0e0',      // Ice Blue - Buttons, highlights, links
          lightblue: '#dceeff', // Soft Frost - Section backgrounds, cards
          white: '#FFFFFF',     // Snow White - Text areas, forms
          red: '#e11d48',       // Warm "live" accent (used intentionally)
        },
        // Semantic mappings (backward compatibility + new structure)
        'theme-bg': '#e9f6ff',          // Main content background (Frost wash)
        'theme-navy': '#0c2c4a',        // Dark sections
        'theme-text': '#0f2c45',        // Glacier ink (high contrast on frost)
        'theme-text-light': '#FFFFFF',  // White text for dark backgrounds
        'theme-accent': '#38bdf8',      // Icy cyan accent
        'theme-secondary': '#1d6fb8',   // Ice deep
        'theme-soft-blue': '#dceeff',   // Soft Frost

        // Mapping standard colors to the new theme for compatibility
        primary: {
          50: '#f0f9ff',
          100: '#dceeff',
          200: '#bae1fd',
          300: '#7dd3fc',
          400: '#54bdf5',
          500: '#3ea0e0', // Main Ice Blue
          600: '#1d6fb8',
          700: '#175a96',
          800: '#13456e',
          900: '#0c2c4a',
        },
        // Ice deep for secondary
        secondary: {
          50: '#eef7ff',
          100: '#d7ecfd',
          200: '#b0d8fa',
          300: '#7dbef3',
          400: '#4f9fe4',
          500: '#3ea0e0',
          600: '#1d6fb8',
          700: '#175a96',
          800: '#13456e',
          900: '#0c2c4a',
        },
        accent: {
          light: '#7dd3fc',
          DEFAULT: '#38bdf8',
          dark: '#1d6fb8',
          white: '#ffffff',
          black: '#0c2c4a',
        },
      },
      fontFamily: {
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        inter: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
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
        'frost': '0 22px 50px -24px rgba(20, 70, 120, .45), 0 2px 0 rgba(255, 255, 255, .7) inset',
        'frost-soft': '0 14px 34px -20px rgba(20, 70, 120, .4)',
        'glow': '0 0 0 1px rgba(255, 255, 255, .6), 0 14px 40px -14px rgba(56, 189, 248, .6)',
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
