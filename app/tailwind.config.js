/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', sunk: 'var(--sunk)', fg: 'var(--fg)',
        muted: 'var(--muted)', line: 'var(--line)', accent: 'var(--accent)', 'accent-soft': 'var(--accent-soft)',
        warn: 'var(--warn)', ok: 'var(--ok)', danger: 'var(--danger)',
      },
      fontFamily: { ui: ['var(--ui-font)'], write: ['var(--write-font)'] },
    },
  },
  plugins: [],
}
