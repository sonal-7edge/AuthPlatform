import LoadingSpinner from '../LoadingSpinner'

/**
 * Primary action button used across auth screens.
 * @param {{ text: string, handleClick?: () => void, loading?: boolean, type?: string, disabled?: boolean }} props
 */
export default function Button({ text, handleClick, loading, type = 'button', disabled }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`w-full h-11 rounded-lg font-semibold text-white transition-opacity flex items-center justify-center
        ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}
        bg-gradient-to-r from-primary to-primary-dark`}
    >
      {loading ? <LoadingSpinner /> : text}
    </button>
  )
}
