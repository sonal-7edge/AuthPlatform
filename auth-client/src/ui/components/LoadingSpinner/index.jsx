/**
 * Small inline spinner for button loading states.
 * @param {{ size?: string, color?: string }} props
 */
export default function LoadingSpinner({ size = 'h-5 w-5', color = 'border-white' }) {
  return (
    <span
      className={`inline-block ${size} rounded-full border-2 border-t-transparent ${color} animate-spin`}
    />
  )
}
