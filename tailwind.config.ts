import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        n: {
          black: 'var(--n-black)',
          surface: 'var(--n-surface)',
          'surface-raised': 'var(--n-surface-raised)',
          border: 'var(--n-border)',
          'border-visible': 'var(--n-border-visible)',
          'text-disabled': 'var(--n-text-disabled)',
          'text-secondary': 'var(--n-text-secondary)',
          'text-primary': 'var(--n-text-primary)',
          'text-display': 'var(--n-text-display)',
          accent: 'var(--n-accent)',
          'accent-subtle': 'var(--n-accent-subtle)',
          success: 'var(--n-success)',
          warning: 'var(--n-warning)',
          interactive: 'var(--n-interactive)',
        },
      },
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', '"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        'nothing': '12px',
        'nothing-sm': '8px',
        'nothing-xs': '4px',
        'pill': '999px',
      },
    },
  },
  plugins: [],
}
export default config
