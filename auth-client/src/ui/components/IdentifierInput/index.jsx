import FormField from '../FormField'
import { IDENTIFIER_TYPE } from '../../../core/constants'

const TABS = [
  { type: IDENTIFIER_TYPE.EMAIL, label: 'Email' },
  { type: IDENTIFIER_TYPE.PHONE, label: 'Phone' },
]

/**
 * Email/phone segmented switch paired with the matching input.
 *
 * @param {{
 *   type: string,
 *   value: string,
 *   onChange: (event) => void,
 *   onTypeChange: (type: string) => void,
 *   error?: string,
 * }} props
 */
export default function IdentifierInput({ type, value, onChange, error, onTypeChange }) {
  const isEmail = type === IDENTIFIER_TYPE.EMAIL

  return (
    <div>
      <div role="tablist" aria-label="Sign in with" className="flex gap-1 p-1 mb-3 bg-ac-subtle rounded-ac">
        {TABS.map((tab) => {
          const selected = type === tab.type
          return (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTypeChange(tab.type)}
              className={`flex-1 h-8 text-sm font-medium rounded-[calc(var(--ac-radius)-2px)] transition-colors
                ${selected
                  ? 'bg-ac-surface text-ac-fg shadow-sm'
                  : 'text-ac-muted hover:text-ac-fg'}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <FormField
        label={isEmail ? 'Email' : 'Phone number'}
        type={isEmail ? 'email' : 'tel'}
        inputMode={isEmail ? 'email' : 'tel'}
        placeholder={isEmail ? 'you@example.com' : '+1 234 567 8900'}
        value={value}
        onChange={onChange}
        error={error}
        autoComplete={isEmail ? 'email' : 'tel'}
      />
    </div>
  )
}
