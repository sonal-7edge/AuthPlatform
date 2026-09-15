import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import IdentifierInput from '../components/IdentifierInput'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../../core/constants'
import { validateIdentifier } from '../validation'

export default function SignIn({ setFlow }) {
  const { signIn, isLoading, error } = useAuth()

  const [identifierType, setIdentifierType] = useState(IDENTIFIER_TYPE.EMAIL)
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    const identifierError = validateIdentifier(form.identifier, identifierType)
    if (identifierError) errors.identifier = identifierError
    if (!form.password) errors.password = 'Password is required'
    return errors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    const isEmail = identifierType === IDENTIFIER_TYPE.EMAIL
    const result = await signIn({
      [isEmail ? 'email' : 'phone']: form.identifier,
      password: form.password,
    })

    if (!result.error) {
      setFlow({
        pendingIdentifier: form.identifier,
        identifierType,
        otpPurpose: OTP_PURPOSE.AUTH,
        screen: AUTH_SCREENS.OTP,
      })
    }
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  function switchIdentifierType(type) {
    setIdentifierType(type)
    setForm((f) => ({ ...f, identifier: '' }))
    setFieldErrors({})
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Enter your credentials to continue"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <button
            className="font-medium text-ac-fg hover:underline underline-offset-4"
            onClick={() => setFlow({ screen: AUTH_SCREENS.SIGN_UP })}
          >
            Create one
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <IdentifierInput
          type={identifierType}
          value={form.identifier}
          onChange={set('identifier')}
          error={fieldErrors.identifier}
          onTypeChange={switchIdentifierType}
        />

        <PasswordField
          label="Password"
          placeholder="Enter your password"
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="current-password"
        />

        <div className="flex justify-end -mt-1 mb-4">
          <button
            type="button"
            className="text-xs text-ac-muted hover:text-ac-fg hover:underline underline-offset-4"
            onClick={() => setFlow({ screen: AUTH_SCREENS.FORGOT_PASSWORD })}
          >
            Forgot password?
          </button>
        </div>

        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Sign in" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
