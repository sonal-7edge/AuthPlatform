import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import PasswordField from '../../../components/PasswordField'
import Button from '../../../components/Button'
import { ResetPasswordAction } from '../AuthSlice'

export default function ResetPassword() {
  const dispatch = useDispatch()
  const { isLoading, error, pendingIdentifier, resetToken } = useSelector((state) => state.authStore)

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    if (!form.password) errors.password = 'Password is required'
    else if (form.password.length < 8) errors.password = 'Minimum 8 characters'
    if (form.confirm !== form.password) errors.confirm = 'Passwords do not match'
    return errors
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setFieldErrors({})
    dispatch(ResetPasswordAction({ identifier: pendingIdentifier, resetToken, newPassword: form.password }))
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
