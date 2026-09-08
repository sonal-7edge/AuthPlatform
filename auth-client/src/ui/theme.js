/**
 * Design tokens for the prebuilt screens.
 *
 * The palette is deliberately neutral — a white card on a slate page, a near
 * black accent, system fonts, no gradients — so the screens sit inside a host
 * app without fighting its brand.
 *
 * Values are RGB channel triplets (not `#rrggbb`) because Tailwind composes
 * them as `rgb(var(--token) / <alpha-value>)`, which is what makes opacity
 * utilities like `ring-ac-accent/10` work against a CSS variable.
 */
export const DEFAULT_THEME = {
  bg: '248 250 252', // slate-50   — page background
  surface: '255 255 255', // white      — card
  border: '226 232 240', // slate-200  — hairlines
  'border-strong': '203 213 225', // slate-300  — input borders
  fg: '15 23 42', // slate-900  — primary text
  muted: '100 116 139', // slate-500  — secondary text
  subtle: '241 245 249', // slate-100  — inset surfaces
  accent: '15 23 42', // slate-900  — primary actions
  'accent-fg': '255 255 255', // text on accent
  'accent-hover': '30 41 59', // slate-800
  danger: '220 38 38', // red-600
  'danger-surface': '254 242 242', // red-50
  'danger-border': '254 202 202', // red-200
  success: '22 163 74', // green-600
  'success-surface': '240 253 244', // green-50
  'success-border': '187 247 208', // green-200
}

const VAR_PREFIX = '--ac-'

/** Accepts `#0f172a`, `rgb(15 23 42)` or `15 23 42` and returns `15 23 42`. */
function toChannels(value) {
  if (typeof value !== 'string') return null
  const input = value.trim()

  const hex = input.match(/^#?([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((c) => c + c).join('')
      : hex[1]
    const int = parseInt(digits, 16)
    return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
  }

  const numbers = input.match(/\d{1,3}/g)
  if (numbers?.length >= 3) return numbers.slice(0, 3).join(' ')

  return null
}

/**
 * Writes theme tokens as CSS custom properties. Only recognised keys are
 * applied, so a typo can't inject arbitrary properties onto the element.
 *
 * @param {Partial<typeof DEFAULT_THEME>} theme
 * @param {HTMLElement} [target] defaults to <html>
 */
export function applyTheme(theme, target) {
  const element = target ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!element || !theme) return

  Object.entries(theme).forEach(([token, value]) => {
    if (!(token in DEFAULT_THEME)) return
    const channels = toChannels(value)
    if (channels) element.style.setProperty(`${VAR_PREFIX}${token}`, channels)
  })
}

/** Removes any overrides applied by {@link applyTheme}, restoring the defaults. */
export function resetTheme(target) {
  const element = target ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!element) return
  Object.keys(DEFAULT_THEME).forEach((token) => {
    element.style.removeProperty(`${VAR_PREFIX}${token}`)
  })
}
