/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Diamond Glow Branding
        // Luxe Nightfall Palette
        theme: {
          navy: '#0B1430',      // Deep Navy - Main background, headers, footer
          blue: '#D6A24A',      // Champagne Gold - Buttons, highlights, links
          lightblue: '#F4E7D1', // Soft Champagne - Section backgrounds, cards
          white: '#FFFFFF',     // Clean White - Text areas, forms
          red: '#B87C2E',       // Warm Gold Accent
        },
        // Semantic mappings (backward compatibility + new structure)
        'theme-bg': '#FFF9F1',          // Main content background (Warm Ivory)
        'theme-navy': '#0B1430',        // Dark sections
        'theme-text': '#0B1430',        // Deep Navy for text (high contrast on ivory)
        'theme-text-light': '#FFFFFF',  // White text for dark backgrounds
        'theme-accent': '#D6A24A',      // Champagne Gold
        'theme-secondary': '#B87C2E',   // Warm Gold
        'theme-soft-blue': '#F4E7D1',   // Soft Champagne

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
        // Using Warm Gold for secondary to match logo accents
        secondary: {
          50: '#FFF7E8',
          100: '#FDEBC7',
          200: '#F8D89A',
          300: '#F0C26B',
          400: '#E6AD45',
          500: '#D6A24A', // Main Gold
          600: '#C18D36',
          700: '#9E6E26',
          800: '#7D561D',
          900: '#614316',
        },
        accent: {
          light: '#F0D7A0',
          DEFAULT: '#D6A24A',
          dark: '#C18D36',
          white: '#ffffff',
          black: '#0F172A',
        },
      },
      fontFamily: {
        body: ['Manrope', 'sans-serif'],
        display: ['Cormorant Garamond', 'serif'],
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
