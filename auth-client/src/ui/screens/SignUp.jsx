import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import IdentifierInput from '../components/IdentifierInput'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../../core/constants'
import {
  MIN_PASSWORD_LENGTH,
  validateConfirmation,
  validateIdentifier,
  validatePassword,
} from '../validation'

export default function SignUp({ setFlow }) {
  const { signUp, isLoading, error, clearError } = useAuth()

  const [identifierType, setIdentifierType] = useState(IDENTIFIER_TYPE.EMAIL)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    identifier: '',
    password: '',
    confirm: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required'

    const identifierError = validateIdentifier(form.identifier, identifierType)
    if (identifierError) errors.identifier = identifierError

    const passwordError = validatePassword(form.password)
    if (passwordError) errors.password = passwordError

    const confirmError = validateConfirmation(form.password, form.confirm)
    if (confirmError) errors.confirm = confirmError

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
    const result = await signUp({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      [isEmail ? 'email' : 'phone']: form.identifier.trim(),
      password: form.password,
    })

    if (!result.error) {
      setFlow({
        pendingIdentifier: form.identifier.trim(),
        identifierType,
        otpPurpose: OTP_PURPOSE.AUTH,
        screen: AUTH_SCREENS.OTP,
      })
    }
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
    // Names are worth keeping; the identifier and both passwords are not.
    setForm((f) => ({ ...f, identifier: '', password: '', confirm: '' }))
    setFieldErrors({})
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Get started in a couple of steps"
      footer={
        <>
          Already have an account?{' '}
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
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="First name"
            type="text"
            placeholder="Jane"
            value={form.firstName}
            onChange={set('firstName')}
            error={fieldErrors.firstName}
            autoComplete="given-name"
          />
          <FormField
            label="Last name"
            type="text"
            placeholder="Doe"
            value={form.lastName}
            onChange={set('lastName')}
            error={fieldErrors.lastName}
            autoComplete="family-name"
          />
        </div>

        <IdentifierInput
          type={identifierType}
          value={form.identifier}
          onChange={set('identifier')}
          error={fieldErrors.identifier}
          onTypeChange={switchIdentifierType}
        />

        <PasswordField
          label="Password"
          placeholder="Create a password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
          showStrength
        />

        <PasswordField
          label="Confirm password"
          placeholder="Re-enter your password"
          value={form.confirm}
          onChange={set('confirm')}
          error={fieldErrors.confirm}
          autoComplete="new-password"
        />

        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Create account" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
