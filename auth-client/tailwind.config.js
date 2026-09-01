/** @type {import('tailwindcss').Config} */

/** Token -> `rgb(var(--ac-token) / <alpha-value>)`, so `bg-ac-accent/10` works. */
const token = (name) => `rgb(var(--ac-${name}) / <alpha-value>)`

export default {
  // Preflight ships inside the published CSS, which would reset the host app's
  // styles too. The screens carry their own explicit styling, so it isn't needed.
  corePlugins: { preflight: false },
  content: ['./src/ui/**/*.jsx'],
  theme: {
    extend: {
      colors: {
        ac: {
          bg: token('bg'),
          surface: token('surface'),
          border: token('border'),
          'border-strong': token('border-strong'),
          fg: token('fg'),
          muted: token('muted'),
          subtle: token('subtle'),
          accent: token('accent'),
          'accent-fg': token('accent-fg'),
          'accent-hover': token('accent-hover'),
          danger: token('danger'),
          'danger-surface': token('danger-surface'),
          'danger-border': token('danger-border'),
          success: token('success'),
          'success-surface': token('success-surface'),
          'success-border': token('success-border'),
        },
      },
      borderRadius: {
        ac: 'var(--ac-radius)',
        'ac-lg': 'var(--ac-radius-lg)',
      },
      fontFamily: {
        ac: 'var(--ac-font)',
      },
    },
  },
  plugins: [],
}
