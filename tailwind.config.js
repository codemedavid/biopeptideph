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
        // Tiffany Blue Palette
        theme: {
          navy: '#0F4744',      // Deep Teal - Headers, footer, dark sections
          blue: '#0ABAB5',      // Tiffany Blue - Buttons, highlights, links
          lightblue: '#D6F0EE', // Soft Tiffany - Section backgrounds, cards
          white: '#FFFFFF',     // Clean White - Text areas, forms
          red: '#088B87',       // Deep Tiffany Accent
        },
        // Semantic mappings (backward compatibility + new structure)
        'theme-bg': '#F7FCFC',          // Main content background (Soft Ice)
        'theme-navy': '#0F4744',        // Dark sections
        'theme-text': '#0F4744',        // Deep Teal for text (high contrast on ice)
        'theme-text-light': '#FFFFFF',  // White text for dark backgrounds
        'theme-accent': '#0ABAB5',      // Tiffany Blue
        'theme-secondary': '#088B87',   // Deep Tiffany
        'theme-soft-blue': '#D6F0EE',   // Soft Tiffany

        // Mapping standard colors to the new theme for compatibility
        primary: {
          50: '#F0FAF9',
          100: '#D6F0EE',
          200: '#A8E2DE',
          300: '#6FCFC9',
          400: '#2EC1BB',
          500: '#0ABAB5', // Main Tiffany Blue
          600: '#088B87',
          700: '#066D6A',
          800: '#05524F',
          900: '#03393A',
        },
        // Using Deep Tiffany for secondary
        secondary: {
          50: '#E8F8F7',
          100: '#C7EFEC',
          200: '#9AE0DC',
          300: '#6BCEC8',
          400: '#3FBCB5',
          500: '#0ABAB5', // Main Tiffany
          600: '#088B87',
          700: '#066D6A',
          800: '#05524F',
          900: '#03393A',
        },
        accent: {
          light: '#A8E2DE',
          DEFAULT: '#0ABAB5',
          dark: '#088B87',
          white: '#ffffff',
          black: '#0F4744',
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
