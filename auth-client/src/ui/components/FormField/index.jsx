import { useId } from 'react'

/** Shared input chrome, so FormField and PasswordField can't drift apart. */
export function inputClassName(error, extra = '') {
  return `w-full h-10 px-3 rounded-ac bg-ac-surface text-sm text-ac-fg
    placeholder:text-ac-muted/70 border transition-colors outline-none
    focus:ring-2 focus:ring-ac-accent/15
    ${error
      ? 'border-ac-danger focus:border-ac-danger focus:ring-ac-danger/15'
      : 'border-ac-border-strong focus:border-ac-accent'}
    ${extra}`
}

/**
 * Labelled input with inline validation error.
 * Any extra props are forwarded to the underlying `<input>`.
 *
 * @param {{ label?: string, error?: string, hint?: string, id?: string }} props
 */
export default function FormField({ label, error, hint, id, ...inputProps }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block mb-1.5 text-sm font-medium text-ac-fg">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={inputClassName(error)}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-ac-danger">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ac-muted">{hint}</p>
      ) : null}
    </div>
  )
}
