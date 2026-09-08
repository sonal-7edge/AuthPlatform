/**
 * Labeled input with inline validation error.
 * @param {{ label: string, error?: string }} props — rest forwarded to <input>
 */
export default function FormField({ label, error, ...inputProps }) {
  return (
    <div className="flex flex-col gap-1 mb-4">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        className={`px-3.5 py-2.5 rounded-lg border text-sm text-gray-900 outline-none transition-shadow
          focus:ring-2 focus:ring-primary/30
          ${error ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-primary'}`}
        {...inputProps}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
