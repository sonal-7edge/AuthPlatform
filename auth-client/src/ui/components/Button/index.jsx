import LoadingSpinner from '../LoadingSpinner'

const VARIANTS = {
  primary: 'bg-ac-accent text-ac-accent-fg hover:bg-ac-accent-hover',
  secondary: 'bg-ac-surface text-ac-fg border border-ac-border-strong hover:bg-ac-subtle',
  danger: 'bg-ac-danger text-white hover:opacity-90',
}

/**
 * Full-width action button.
 *
 * @param {{
 *   text?: string,
 *   children?: React.ReactNode,
 *   handleClick?: () => void,
 *   loading?: boolean,
 *   type?: 'button' | 'submit' | 'reset',
 *   variant?: keyof typeof VARIANTS,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function Button({
  text,
  children,
  handleClick,
  loading,
  type = 'button',
  variant = 'primary',
  disabled,
  className = '',
}) {
  const isInactive = disabled || loading

  return (
    <button
      type={type}
      disabled={isInactive}
      onClick={handleClick}
      aria-busy={loading || undefined}
      className={`w-full h-10 px-4 inline-flex items-center justify-center gap-2 rounded-ac
        text-sm font-medium transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac-accent/25 focus-visible:ring-offset-2
        ${VARIANTS[variant] ?? VARIANTS.primary}
        ${isInactive ? 'opacity-50 pointer-events-none' : ''}
        ${className}`}
    >
      {loading ? <LoadingSpinner /> : (children ?? text)}
    </button>
  )
}
