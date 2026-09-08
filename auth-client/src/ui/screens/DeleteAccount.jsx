import { useState } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import Button from '../components/Button'
import Alert from '../components/Alert'

/**
 * Standalone form for an already-authenticated area of the host app (e.g. an
 * account settings page) — not part of the pre-auth AuthFlow.
 *
 * Deletion is gated twice on purpose: an explicit acknowledgement checkbox and
 * a password re-entry. Neither alone is enough to submit.
 *
 * @param {{ onDeleted?: () => void, onCancel?: () => void }} props
 */
export default function DeleteAccount({ onDeleted, onCancel }) {
  const { deleteAccount, isLoading, error, user } = useAuth()

  const [password, setPassword] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [fieldError, setFieldError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!password) {
      setFieldError('Enter your password to confirm')
      return
    }
    setFieldError('')

    const result = await deleteAccount({ password })
    if (!result.error) onDeleted?.()
  }

  const account = user?.email || user?.phone || 'your account'

  return (
    <AuthCard
      title="Delete account"
      subtitle="This is permanent and cannot be undone"
      footer={
        onCancel && (
          <button
            className="font-medium text-ac-fg hover:underline underline-offset-4"
            onClick={onCancel}
          >
            Keep my account
          </button>
        )
      }
    >
      <div className="mb-5 px-3.5 py-3 rounded-ac border border-ac-danger-border bg-ac-danger-surface">
        <p className="text-sm font-medium text-ac-danger">You are about to delete</p>
        <p className="mt-0.5 text-sm text-ac-danger/90 break-all">{account}</p>
        <p className="mt-2 text-xs text-ac-danger/80">
          All associated data will be removed immediately. This cannot be reversed.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--ac-danger))] cursor-pointer"
          />
          <span className="text-sm text-ac-muted">
            I understand this is permanent and want to delete my account
          </span>
        </label>

        <PasswordField
          label="Confirm your password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldError}
          autoComplete="current-password"
          disabled={!acknowledged}
        />

        <Alert tone="error">{error}</Alert>

        <Button
          type="submit"
          text="Delete my account"
          variant="danger"
          loading={isLoading}
          disabled={!acknowledged || !password}
        />
      </form>
    </AuthCard>
  )
}
