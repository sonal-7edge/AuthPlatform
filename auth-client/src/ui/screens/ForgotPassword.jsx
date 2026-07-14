import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import IdentifierInput from '../components/IdentifierInput'
import Button from '../components/Button'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../../core/constants'

export default function ForgotPassword({ setFlow }) {
  const { forgotPassword, isLoading, error } = useAuth()

  const [identifierType, setIdentifierType] = useState(IDENTIFIER_TYPE.EMAIL)
  const [identifier, setIdentifier] = useState('')
  const [fieldError, setFieldError] = useState('')

  function validate() {
    if (!identifier) return identifierType === IDENTIFIER_TYPE.EMAIL ? 'Email is required' : 'Phone number is required'
    if (identifierType === IDENTIFIER_TYPE.EMAIL && !/\S+@\S+\.\S+/.test(identifier))
      return 'Enter a valid email'
    if (identifierType === IDENTIFIER_TYPE.PHONE && !/^\+?\d{7,15}$/.test(identifier.replace(/\s/g, '')))
      return 'Enter a valid phone number'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setFieldError(err); return }
    setFieldError('')

    const result = await forgotPassword({ identifier, identifierType })
    if (!result.error) {
      setFlow({
        pendingIdentifier: identifier,
        identifierType,
        otpPurpose: OTP_PURPOSE.PASSWORD_RESET,
        screen: AUTH_SCREENS.RESET_PASSWORD_OTP,
      })
    }
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll send a reset code to your registered contact">
      <form onSubmit={handleSubmit} noValidate>
        <IdentifierInput
          type={identifierType}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={fieldError}
          onTypeChange={(t) => { setIdentifierType(t); setIdentifier(''); setFieldError('') }}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            {error}
          </p>
        )}

        <Button type="submit" text="Send Reset Code" loading={isLoading} />
      </form>

      <p className="text-center mt-5 text-sm text-gray-500">
        Remember your password?{' '}
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => setFlow({ screen: AUTH_SCREENS.SIGN_IN })}
        >
          Sign in
        </button>
      </p>
    </AuthCard>
  )
}
