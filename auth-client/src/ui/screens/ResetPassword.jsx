import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { MIN_PASSWORD_LENGTH, validateConfirmation, validatePassword } from '../validation'

export default function ResetPassword({ flow, setFlow }) {
  const { resetPassword, isLoading, error } = useAuth()
  const { resetToken } = flow

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    const passwordError = validatePassword(form.password, { label: 'New password' })
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

    const result = await resetPassword({ resetToken, newPassword: form.password })

    if (!result.error) {
      setFlow({
        screen: AUTH_SCREENS.SIGN_IN,
        resetToken: null,
        pendingIdentifier: null,
        notice: 'Password updated. Sign in with your new password.',
      })
    }
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  return (
    <AuthCard title="Set a new password" subtitle="Choose a password you haven't used before">
      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="New password"
          placeholder="Enter a new password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
          showStrength
        />

        <PasswordField
          label="Confirm new password"
          placeholder="Re-enter your new password"
          value={form.confirm}
          onChange={set('confirm')}
          error={fieldErrors.confirm}
          autoComplete="new-password"
        />

        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Reset password" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
