import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import IdentifierInput from '../components/IdentifierInput'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../../core/constants'
import { validateIdentifier } from '../validation'

export default function ForgotPassword({ setFlow }) {
  const { forgotPassword, isLoading, error } = useAuth()

  const [identifierType, setIdentifierType] = useState(IDENTIFIER_TYPE.EMAIL)
  const [identifier, setIdentifier] = useState('')
  const [fieldError, setFieldError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateIdentifier(identifier, identifierType)
    if (validationError) {
      setFieldError(validationError)
      return
    }
    setFieldError('')

    const isEmail = identifierType === IDENTIFIER_TYPE.EMAIL
    const result = await forgotPassword({
      identifier: identifier.trim(),
      identifierType,
      [isEmail ? 'email' : 'phone']: identifier.trim(),
    })

    if (!result.error) {
      setFlow({
        pendingIdentifier: identifier.trim(),
        identifierType,
        otpPurpose: OTP_PURPOSE.PASSWORD_RESET,
        screen: AUTH_SCREENS.RESET_PASSWORD_OTP,
      })
    }
  }

  function switchIdentifierType(type) {
    setIdentifierType(type)
    setIdentifier('')
    setFieldError('')
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="We'll send a verification code to your registered contact"
      footer={
        <>
          Remembered it?{' '}
          <button
            className="font-medium text-ac-fg hover:underline underline-offset-4"
            onClick={() => setFlow({ screen: AUTH_SCREENS.SIGN_IN })}
          >
            Sign in
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <IdentifierInput
          type={identifierType}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={fieldError}
          onTypeChange={switchIdentifierType}
        />

        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Send code" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
