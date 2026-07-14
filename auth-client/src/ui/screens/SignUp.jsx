import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import IdentifierInput from '../components/IdentifierInput'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../../core/constants'

export default function SignUp({ setFlow }) {
  const { signUp, isLoading, error } = useAuth()

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

    if (identifierType === IDENTIFIER_TYPE.EMAIL) {
      if (!form.identifier) errors.identifier = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(form.identifier)) errors.identifier = 'Enter a valid email'
    } else {
      if (!form.identifier) errors.identifier = 'Phone number is required'
      else if (!/^\+?\d{7,15}$/.test(form.identifier.replace(/\s/g, '')))
        errors.identifier = 'Enter a valid phone number'
    }

    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 8) errors.password = 'Minimum 8 characters'
    if (form.confirm !== form.password) errors.confirm = 'Passwords do not match'
    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setFieldErrors({})

    const result = await signUp({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      [identifierType === IDENTIFIER_TYPE.EMAIL ? 'email' : 'phone']: form.identifier,
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <AuthCard title="Create account" subtitle="Sign up to get started">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex gap-3">
          <div className="flex-1">
            <FormField
              label="First name"
              type="text"
              placeholder="Jane"
              value={form.firstName}
              onChange={set('firstName')}
              error={fieldErrors.firstName}
              autoComplete="given-name"
            />
          </div>
          <div className="flex-1">
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
        </div>

        <IdentifierInput
          type={identifierType}
          value={form.identifier}
          onChange={set('identifier')}
          error={fieldErrors.identifier}
          onTypeChange={(t) => { setIdentifierType(t); setForm((f) => ({ ...f, identifier: '' })); setFieldErrors({}) }}
        />

        <PasswordField
          label="Password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          label="Confirm password"
          placeholder="Re-enter password"
          value={form.confirm}
          onChange={set('confirm')}
          error={fieldErrors.confirm}
          autoComplete="new-password"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            {error}
          </p>
        )}

        <Button type="submit" text="Create Account" loading={isLoading} />
      </form>

      <p className="text-center mt-5 text-sm text-gray-500">
        Already have an account?{' '}
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
