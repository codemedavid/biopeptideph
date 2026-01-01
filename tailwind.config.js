/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Biopeptides Branding
        // Clinical Futurism Palette
        theme: {
          navy: '#0B1F33',      // Deep Navy / Midnight Blue - Main background, headers, footer
          blue: '#2E8BC0',      // Science Blue - Buttons, highlights, links
          lightblue: '#E6F2FA', // Soft Light Blue - Section backgrounds, cards
          white: '#FFFFFF',     // Clean White - Text areas, forms
          red: '#E63946',       // Minimal Red Accent (from logo)
        },
        // Semantic mappings (backward compatibility + new structure)
        'theme-bg': '#FFFFFF',          // Main content background (Clean White)
        'theme-navy': '#0B1F33',        // Dark sections
        'theme-text': '#0B1F33',        // Deep Navy for text (high contrast on white)
        'theme-text-light': '#FFFFFF',  // White text for dark backgrounds
        'theme-accent': '#2E8BC0',      // Science Blue
        'theme-secondary': '#E63946',   // Minimal Red
        'theme-soft-blue': '#E6F2FA',   // Soft Light Blue

        // Mapping standard colors to the new theme for compatibility
        primary: {
          50: '#F8FAFC',
          100: '#E0F0FE',
          200: '#BAE2FE',
          300: '#7CC1FD',
          400: '#359DFA',
          500: '#2B76D9', // Main Blue
          600: '#0F5BB5',
          700: '#0C4891',
          800: '#0A3D78',
          900: '#083262',
        },
        // Using Red/Danger for secondary to match logo accents
        secondary: {
          50: '#FEF2F2',
          100: '#FFE1E1',
          200: '#FFC8C8',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444', // Main Red
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        accent: {
          light: '#7CC1FD',
          DEFAULT: '#2B76D9',
          dark: '#0F5BB5',
          white: '#ffffff',
          black: '#0F172A',
        },
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'medium': '0 4px 15px rgba(0, 0, 0, 0.05)',
        'hover': '0 8px 25px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-out',
        'slideIn': 'slideIn 0.4s ease-out',
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
      },
    },
  },
  plugins: [],
}
