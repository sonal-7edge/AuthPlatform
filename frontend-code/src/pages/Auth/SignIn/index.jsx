import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import FormField from '../../../components/FormField'
import IdentifierInput from '../../../components/IdentifierInput'
import Button from '../../../components/Button'
import { SignInAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS, IDENTIFIER_TYPE } from '../../../constants/authConstants'

export default function SignIn() {
  const dispatch = useDispatch()
  const { isLoading, error } = useSelector((state) => state.authStore)

  const [identifierType, setIdentifierType] = useState(IDENTIFIER_TYPE.EMAIL)
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    if (identifierType === IDENTIFIER_TYPE.EMAIL) {
      if (!form.identifier) errors.identifier = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(form.identifier)) errors.identifier = 'Enter a valid email'
    } else {
      if (!form.identifier) errors.identifier = 'Phone number is required'
      else if (!/^\+?\d{7,15}$/.test(form.identifier.replace(/\s/g, '')))
        errors.identifier = 'Enter a valid phone number'
    }
    if (!form.password) errors.password = 'Password is required'
    return errors
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setFieldErrors({})
    dispatch(SignInAction({
      [identifierType === IDENTIFIER_TYPE.EMAIL ? 'email' : 'phone']: form.identifier,
      password: form.password,
    }))
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your account">
      <form onSubmit={handleSubmit} noValidate>
        <IdentifierInput
          type={identifierType}
          value={form.identifier}
          onChange={set('identifier')}
          error={fieldErrors.identifier}
          onTypeChange={(t) => { setIdentifierType(t); setForm((f) => ({ ...f, identifier: '' })); setFieldErrors({}) }}
        />

        <FormField
          label="Password"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="current-password"
        />

        <div className="flex justify-end mb-4 -mt-2">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:text-primary-dark underline underline-offset-2"
            onClick={() => dispatch(setScreen(AUTH_SCREENS.FORGOT_PASSWORD))}
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            {error}
          </p>
        )}

        <Button type="submit" text="Sign In" loading={isLoading} />
      </form>

      <p className="text-center mt-5 text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => dispatch(setScreen(AUTH_SCREENS.SIGN_UP))}
        >
          Sign up
        </button>
      </p>
    </AuthCard>
  )
}
