import FormField from '../FormField'
import { IDENTIFIER_TYPE } from '../../../core/constants'

export default function IdentifierInput({ type, value, onChange, error, onTypeChange }) {
  return (
    <div>
      <div className="flex bg-gray-100 rounded-lg p-0.5 mb-3">
        {[IDENTIFIER_TYPE.EMAIL, IDENTIFIER_TYPE.PHONE].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              type === t
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === IDENTIFIER_TYPE.EMAIL ? 'Email' : 'Phone'}
          </button>
        ))}
      </div>
      <FormField
        label={type === IDENTIFIER_TYPE.EMAIL ? 'Email' : 'Phone number'}
        type={type === IDENTIFIER_TYPE.EMAIL ? 'email' : 'tel'}
        placeholder={type === IDENTIFIER_TYPE.EMAIL ? 'you@example.com' : '+1 234 567 8900'}
        value={value}
        onChange={onChange}
        error={error}
        autoComplete={type === IDENTIFIER_TYPE.EMAIL ? 'email' : 'tel'}
      />
    </div>
  )
}
