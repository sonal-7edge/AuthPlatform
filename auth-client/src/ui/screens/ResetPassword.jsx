import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import { AUTH_SCREENS } from '../constants'

export default function ResetPassword({ flow, setFlow }) {
  const { resetPassword, isLoading, error } = useAuth()
  const { pendingIdentifier, resetToken } = flow

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
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

    const result = await resetPassword({ identifier: pendingIdentifier, resetToken, newPassword: form.password })
    if (!result.error) {
      setFlow({ screen: AUTH_SCREENS.SIGN_IN, resetToken: null, pendingIdentifier: null })
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <AuthCard title="Set new password" subtitle="Choose a strong password for your account">
      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="New password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          label="Confirm new password"
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

        <Button type="submit" text="Reset Password" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
