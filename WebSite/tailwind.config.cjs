/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./*/index.html", "./*/*/index.html", "./js/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};