import { useId, useState } from 'react'
import { inputClassName } from '../FormField'

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

/** 0-4. Length is the gate; character variety earns the rest. */
function computeStrength(password) {
  if (!password || password.length < 8) return 0
  let score = 1
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  return score
}

const LEVELS = [
  { label: 'Too short', bar: 'bg-ac-danger', text: 'text-ac-danger' },
  { label: 'Weak', bar: 'bg-ac-danger', text: 'text-ac-danger' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Good', bar: 'bg-ac-fg/60', text: 'text-ac-muted' },
  { label: 'Strong', bar: 'bg-ac-success', text: 'text-ac-success' },
]

function StrengthMeter({ value, describedById }) {
  const score = computeStrength(value)
  const level = LEVELS[score]

  return (
    <div className="mt-2" id={describedById}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              step <= score ? level.bar : 'bg-ac-border'
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs ${level.text}`}>
        <span className="sr-only">Password strength: </span>
        {level.label}
      </p>
    </div>
  )
}

/**
 * Password input with a show/hide toggle and an optional strength meter.
 *
 * @param {{
 *   label?: string,
 *   error?: string,
 *   hint?: string,
 *   showStrength?: boolean,
 *   value: string,
 *   onChange: (event) => void,
 *   id?: string,
 * }} props
 */
export default function PasswordField({
  label,
  error,
  hint,
  showStrength,
  value,
  onChange,
  id,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const strengthId = `${inputId}-strength`

  const describedBy = [
    error ? errorId : null,
    hint && !error ? hintId : null,
    showStrength && value ? strengthId : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block mb-1.5 text-sm font-medium text-ac-fg">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClassName(error, 'pr-10')}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          // Keep the toggle out of the tab order: it's a convenience, and
          // stopping between every password field and the submit button is worse.
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-ac-muted hover:text-ac-fg transition-colors"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {showStrength && value && <StrengthMeter value={value} describedById={strengthId} />}

      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-ac-danger">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ac-muted">{hint}</p>
      ) : null}
    </div>
  )
}
