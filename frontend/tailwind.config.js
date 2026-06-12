/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        "tx-1": "var(--tx-1)",
        "tx-2": "var(--tx-2)",
        "tx-3": "var(--tx-3)",
        a: "var(--a)",
        "a-dim": "var(--a-dim)",
        "a-soft": "var(--a-soft)",
        b: "var(--b)",
        "b-dim": "var(--b-dim)",
        "b-soft": "var(--b-soft)",
        warn: "var(--warn)",
        good: "var(--good)",
      },
      fontFamily: {
        mono: ["var(--mono)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
    },
  },
  plugins: [],
};
