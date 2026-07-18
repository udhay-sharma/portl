/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Core neutrals
        bg: '#F6F4F0',
        surface: '#FFFFFF',
        border: '#E6E2DC',
        text: '#222222',
        muted: '#666666',

        // Role accents (exact hex values from docs)
        resident: '#C97D5C', // terracotta
        'resident-bg': '#FBF6F3',
        guard: '#C99A3C', // amber
        admin: '#3A4048', // slate

        // Status colors for state machine badges (exact hex values from docs)
        'status-pending': '#C99A3C', // amber
        'status-approved': '#C97D5C', // terracotta
        'status-checkedin': '#5B8C5A', // green
        'status-checkedout': '#8A8377', // gray
        'status-rejected': '#B5544A', // muted red
        'status-expired': '#A8A199', // faded gray
      },
      spacing: {
        sm: '8px',
        md: '16px',
        lg: '24px',
      },
      borderRadius: {
        card: '16px',
        control: '8px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
};
