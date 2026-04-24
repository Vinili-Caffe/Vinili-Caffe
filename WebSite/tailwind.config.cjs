/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./**/*.html", "./js/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};