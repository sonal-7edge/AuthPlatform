import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { MIN_PASSWORD_LENGTH, validateConfirmation, validatePassword } from '../validation'

/**
 * Standalone form for an already-authenticated area of the host app (e.g. an
 * account settings page) — not part of the pre-auth AuthFlow.
 *
 * @param {{ onSuccess?: () => void, onCancel?: () => void }} props
 */
export default function ChangePassword({ onSuccess, onCancel }) {
  const { changePassword, isLoading, error } = useAuth()

  const [form, setForm] = useState({ current: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [succeeded, setSucceeded] = useState(false)
  const successTimer = useRef(null)

  // Clear the pending redirect if the host unmounts us first.
  useEffect(() => () => clearTimeout(successTimer.current), [])

  function validate() {
    const errors = {}
    if (!form.current) errors.current = 'Current password is required'

    const passwordError = validatePassword(form.password, { label: 'New password' })
    if (passwordError) errors.password = passwordError
    else if (form.password === form.current) {
      errors.password = 'New password must differ from the current one'
    }

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

    const result = await changePassword({
      currentPassword: form.current,
      newPassword: form.password,
    })

    if (!result.error) {
      setSucceeded(true)
      successTimer.current = setTimeout(() => onSuccess?.(), 1500)
    }
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  if (succeeded) {
    return (
      <AuthCard title="Password updated" subtitle="Your password has been changed">
        <div className="flex flex-col items-center py-4 text-center">
          <div className="w-10 h-10 rounded-full bg-ac-success-surface border border-ac-success-border flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-ac-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-ac-muted">Taking you back…</p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Change password"
      subtitle="Update the password for your account"
      footer={
        onCancel && (
          <button
            className="font-medium text-ac-fg hover:underline underline-offset-4"
            onClick={onCancel}
          >
            Cancel
          </button>
        )
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="Current password"
          placeholder="Enter your current password"
          value={form.current}
          onChange={set('current')}
          error={fieldErrors.current}
          autoComplete="current-password"
        />

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

        <Button type="submit" text="Update password" loading={isLoading} />
      </form>
    </AuthCard>
  )
}
