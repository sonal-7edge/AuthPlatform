import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import PasswordField from '../../../components/PasswordField'
import Button from '../../../components/Button'
import { ChangePasswordAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS } from '../../../constants/authConstants'

export default function ChangePassword() {
  const dispatch = useDispatch()
  const { isLoading, error } = useSelector((state) => state.authStore)

  const [form, setForm] = useState({ current: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState(false)

  function validate() {
    const errors = {}
    if (!form.current) errors.current = 'Current password is required'
    if (!form.password) errors.password = 'New password is required'
    else if (form.password.length < 8) errors.password = 'Minimum 8 characters'
    else if (form.password === form.current) errors.password = 'New password must differ from current'
    if (form.confirm !== form.password) errors.confirm = 'Passwords do not match'
    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setFieldErrors({})
    const result = await dispatch(ChangePasswordAction({ currentPassword: form.current, newPassword: form.password }))
    if (ChangePasswordAction.fulfilled.match(result)) {
      setSuccess(true)
      setTimeout(() => dispatch(setScreen(AUTH_SCREENS.SIGN_IN)), 1800)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <AuthCard title="Change password" subtitle="Update your account password">
      {success ? (
        <div className="text-center py-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-semibold text-gray-800">Password updated!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting you back…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <PasswordField
            label="Current password"
            placeholder="••••••••"
            value={form.current}
            onChange={set('current')}
            error={fieldErrors.current}
            autoComplete="current-password"
          />
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
            placeholder="Re-enter new password"
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

          <Button type="submit" text="Update Password" loading={isLoading} />
        </form>
      )}

      {!success && (
        <p className="text-center mt-5 text-sm text-gray-500">
          <button
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
            onClick={() => dispatch(setScreen(AUTH_SCREENS.SIGN_IN))}
          >
            Back to dashboard
          </button>
        </p>
      )}
    </AuthCard>
  )
}
