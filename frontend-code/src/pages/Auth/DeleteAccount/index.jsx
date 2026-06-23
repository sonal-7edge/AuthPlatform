import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import FormField from '../../../components/FormField'
import { DeleteAccountAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS } from '../../../constants/authConstants'

export default function DeleteAccount() {
  const dispatch = useDispatch()
  const { isLoading, error, user } = useSelector((state) => state.authStore)

  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [fieldError, setFieldError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!password) { setFieldError('Password is required to confirm deletion'); return }
    setFieldError('')
    dispatch(DeleteAccountAction({ password }))
  }

  return (
    <AuthCard title="Delete account" subtitle="This action is permanent and cannot be undone">
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
        <p className="text-sm text-red-700 font-medium mb-1">You are about to delete:</p>
        <p className="text-sm text-red-600">{user?.email || user?.firstName || 'your account'}</p>
        <p className="text-xs text-red-500 mt-2">
          All your data will be permanently removed. This cannot be reversed.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-gray-600">
            I understand this is permanent and want to delete my account
          </span>
        </label>

        <FormField
          label="Enter your password to confirm"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
          autoComplete="current-password"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!confirmed || isLoading}
          className={`w-full h-11 rounded-lg font-semibold text-white transition-opacity flex items-center justify-center
            ${!confirmed || isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}
            bg-red-600`}
        >
          {isLoading ? 'Deleting…' : 'Delete My Account'}
        </button>
      </form>

      <p className="text-center mt-5 text-sm text-gray-500">
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => dispatch(setScreen(AUTH_SCREENS.SIGN_IN))}
        >
          Cancel
        </button>
      </p>
    </AuthCard>
  )
}
