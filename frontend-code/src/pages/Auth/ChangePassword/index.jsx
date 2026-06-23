import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import FormField from '../../../components/FormField'
import Button from '../../../components/Button'
import { ChangePasswordAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS } from '../../../constants/authConstants'

export default function ChangePassword() {
  const dispatch = useDispatch()
  const { isLoading, error } = useSelector((state) => state.authStore)

  const [form, setForm] = useState({ current: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const errors = {}
    if (!form.current) errors.current = 'Current password is required'
    if (!form.password) errors.password = 'New password is required'
    else if (form.password.length < 8) errors.password = 'Minimum 8 characters'
    else if (form.password === form.current) errors.password = 'New password must differ from current'
    if (form.confirm !== form.password) errors.confirm = 'Passwords do not match'
    return errors
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setFieldErrors({})
    dispatch(ChangePasswordAction({ currentPassword: form.current, newPassword: form.password }))
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <AuthCard title="Change password" subtitle="Update your account password">
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Current password"
          type="password"
          placeholder="••••••••"
          value={form.current}
          onChange={set('current')}
          error={fieldErrors.current}
          autoComplete="current-password"
        />
        <FormField
          label="New password"
          type="password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
        />
        <FormField
          label="Confirm new password"
          type="password"
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

      <p className="text-center mt-5 text-sm text-gray-500">
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => dispatch(setScreen(AUTH_SCREENS.SIGN_IN))}
        >
          Back to dashboard
        </button>
      </p>
    </AuthCard>
  )
}
