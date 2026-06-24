import { useState } from 'react'

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function computeStrength(pw) {
  if (!pw || pw.length < 8) return 0
  let score = 1
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

const LEVELS = [
  null,
  { label: 'Weak',     bar: 'bg-red-500',    text: 'text-red-500' },
  { label: 'Fair',     bar: 'bg-orange-400',  text: 'text-orange-500' },
  { label: 'Good',     bar: 'bg-yellow-500',  text: 'text-yellow-600' },
  { label: 'Strong',   bar: 'bg-blue-500',    text: 'text-blue-600' },
  { label: 'Very strong', bar: 'bg-green-500', text: 'text-green-600' },
]

function StrengthBar({ value }) {
  const score = computeStrength(value)
  const level = LEVELS[score]
  return (
    <div className="mt-1.5 mb-0.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= score ? (LEVELS[score]?.bar ?? 'bg-gray-200') : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {level && (
        <p className={`text-xs mt-0.5 ${level.text}`}>{level.label}</p>
      )}
    </div>
  )
}

export default function PasswordField({ label, error, showStrength, value, onChange, ...inputProps }) {
  const [show, setShow] = useState(false)

  return (
    <div className="flex flex-col gap-1 mb-4">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={`w-full px-3.5 py-2.5 pr-11 rounded-lg border text-sm text-gray-900 outline-none transition-shadow
            focus:ring-2 focus:ring-primary/30
            ${error ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-primary'}`}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {showStrength && value && <StrengthBar value={value} />}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
