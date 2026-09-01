/**
 * Inline spinner for button loading states. Inherits the button's text colour
 * by default, so it works on primary, secondary and danger variants alike.
 *
 * @param {{ size?: string, className?: string, label?: string }} props
 */
export default function LoadingSpinner({ size = 'h-4 w-4', className = '', label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block ${size} rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  )
}
