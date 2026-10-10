/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Short windows (a laptop with the bookmarks bar open): the rail tightens up.
      screens: { short: { raw: '(min-width: 640px) and (max-height: 720px)' } },
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', sunk: 'var(--sunk)', fg: 'var(--fg)',
        muted: 'var(--muted)', faint: 'var(--faint)', line: 'var(--line)', 'line-strong': 'var(--line-strong)', raised: 'var(--raised)',
        accent: 'var(--accent)', 'accent-fg': 'var(--accent-fg)', 'accent-soft': 'var(--accent-soft)', link: 'var(--link)',
        warn: 'var(--warn)', ok: 'var(--ok)', danger: 'var(--danger)',
      },
      fontFamily: { ui: ['var(--ui-font)'], write: ['var(--write-font)'] },
    },
  },
  plugins: [],
}
