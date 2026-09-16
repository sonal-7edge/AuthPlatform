import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import IdentifierInput from '../components/IdentifierInput'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE } from '../../core/constants'
import { validateIdentifier } from '../validation'

export default function SignIn({ setFlow, flow, onAuthenticated }) {
  const { signIn, isLoading, error, clearError } = useAuth()

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
    // Signing in authenticates directly — the client persists the bundle and
    // the host app swaps to its own UI off `isAuthenticated`. No OTP step.
    const result = await signIn({
      [isEmail ? 'email' : 'phone']: form.identifier.trim(),
      password: form.password,
    })

    if (!result.error) onAuthenticated?.(result.data)
  }

  const set = (key) => (event) => {
    if (error) clearError()
    // Drop this field's validation error as soon as it is edited.
    setFieldErrors((errors) => (errors[key] ? { ...errors, [key]: '' } : errors))
    setForm((f) => ({ ...f, [key]: event.target.value }))
  }

  function switchIdentifierType(type) {
    if (error) clearError()
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

        {flow?.notice && <Alert tone="success">{flow.notice}</Alert>}
        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Sign in" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
