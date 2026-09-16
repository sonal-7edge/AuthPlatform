/**
 * Inline spinner for button loading states. Inherits the button's text colour
 * by default, so it works on primary, secondary and danger variants alike.
 *
 * Pass `decorative` where the surrounding control already announces the busy
 * state — otherwise the spinner's own label competes with it.
 *
 * @param {{ size?: string, className?: string, label?: string, decorative?: boolean }} props
 */
export default function LoadingSpinner({
  size = 'h-4 w-4',
  className = '',
  label = 'Loading',
  decorative = false,
}) {
  return (
    <span
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={`inline-block ${size} rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  )
}
