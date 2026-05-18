/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fs: {
          cream: "#F4EFE3",
          cream2: "#FBF7EF",
          navy: "#4C2A92",
          navy2: "#321B66",
          lilac: "#8E63C7",
          lilacSoft: "#E9DAFB",
          gold: "#F4BE41",
          ink: "#2F2250",
          muted: "#6F6482",
          border: "#E6DDCC"
        }
      },
      boxShadow: {
        soft: "0 8px 30px rgba(50,27,102,0.10)"
      }
    }
  },
  plugins: []
};
