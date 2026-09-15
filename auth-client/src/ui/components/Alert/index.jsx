const TONES = {
  error: 'bg-ac-danger-surface border-ac-danger-border text-ac-danger',
  success: 'bg-ac-success-surface border-ac-success-border text-ac-success',
  info: 'bg-ac-subtle border-ac-border text-ac-muted',
}

/**
 * Inline status banner. Errors announce assertively so a screen reader
 * interrupts with a failed sign-in; success/info wait their turn.
 *
 * Renders nothing without children, so callers can drop it in unconditionally
 * as `<Alert tone="error">{error}</Alert>`.
 *
 * @param {{ tone?: keyof typeof TONES, children?: React.ReactNode }} props
 */
export default function Alert({ tone = 'error', children }) {
  if (!children) return null

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`mb-4 px-3 py-2.5 rounded-ac border text-sm ${TONES[tone] ?? TONES.info}`}
    >
      {children}
    </div>
  )
}
