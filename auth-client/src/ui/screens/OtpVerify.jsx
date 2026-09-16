import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../react/useAuth'
import AuthCard from '../components/AuthCard'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { AUTH_SCREENS } from '../constants'
import { IDENTIFIER_TYPE, OTP_LENGTH, OTP_PURPOSE } from '../../core/constants'

const RESEND_SECONDS = 60

export default function OtpVerify({ flow, setFlow }) {
  const { verifyOtp, verifyResetOtp, resendOtp, isLoading, error, clearError } = useAuth()
  const { pendingIdentifier, identifierType, otpPurpose } = flow

  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(''))
  const [countdown, setCountdown] = useState(RESEND_SECONDS)
  const [resent, setResent] = useState(false)
  const inputRefs = useRef([])
  const timerRef = useRef(null)

  /**
   * Starts the interval only — the countdown's initial value comes from
   * useState, so mounting doesn't have to setState (which would cascade a
   * render straight out of the effect).
   */
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((seconds) => {
        if (seconds <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return seconds - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    inputRefs.current[0]?.focus()
    startTimer()
    return () => clearInterval(timerRef.current)
  }, [startTimer])

  const submitOtp = useCallback(
    async (otp) => {
      const payload = { identifier: pendingIdentifier, otp }

      if (otpPurpose === OTP_PURPOSE.PASSWORD_RESET) {
        const result = await verifyResetOtp(payload)
        if (!result.error) {
          setFlow({ resetToken: result.data.resetToken, screen: AUTH_SCREENS.RESET_PASSWORD })
        }
        return
      }

      // Sign-up confirmation only: the API returns a message, not tokens, so
      // the user signs in next. `onAuthenticated` fires from SignIn instead.
      const result = await verifyOtp(payload)
      if (!result.error) {
        setFlow({
          pendingIdentifier: null,
          screen: AUTH_SCREENS.SIGN_IN,
          notice: 'Account verified. Sign in to continue.',
        })
      }
    },
    [pendingIdentifier, otpPurpose, verifyOtp, verifyResetOtp, setFlow]
  )

  function handleChange(index, rawValue) {
    // Retyping the code dismisses the previous "incorrect code" error.
    if (error) clearError()
    const char = rawValue.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)

    if (!char) return
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
      return
    }
    // Last box filled — auto-submit only once the whole code is present.
    if (next.every(Boolean)) submitOtp(next.join(''))
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(event) {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return

    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((char, index) => { next[index] = char })
    setDigits(next)

    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
    if (pasted.length === OTP_LENGTH) submitOtp(pasted)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const otp = digits.join('')
    if (otp.length === OTP_LENGTH) submitOtp(otp)
  }

  async function handleResend() {
    setResent(false)
    const result = await resendOtp({ identifier: pendingIdentifier })
    if (result.error) return

    setDigits(Array(OTP_LENGTH).fill(''))
    inputRefs.current[0]?.focus()
    setResent(true)
    setCountdown(RESEND_SECONDS)
    startTimer()
  }

  const isComplete = digits.every(Boolean)
  const isResetFlow = otpPurpose === OTP_PURPOSE.PASSWORD_RESET
  const contactLabel = identifierType === IDENTIFIER_TYPE.PHONE ? 'phone' : 'email'
  const backScreen = isResetFlow ? AUTH_SCREENS.FORGOT_PASSWORD : AUTH_SCREENS.SIGN_IN

  return (
    <AuthCard
      title={isResetFlow ? 'Verify to reset' : 'Confirm your account'}
      subtitle={`Enter the ${OTP_LENGTH}-digit code sent to ${pendingIdentifier || `your ${contactLabel}`}`}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2 justify-between mb-5" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { inputRefs.current[index] = element }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
              className={`ac-otp-input w-11 h-12 text-center text-base font-medium rounded-ac
                bg-ac-surface text-ac-fg border outline-none transition-colors
                focus:border-ac-accent focus:ring-2 focus:ring-ac-accent/15
                ${digit ? 'border-ac-accent' : 'border-ac-border-strong'}`}
            />
          ))}
        </div>

        {resent && <Alert tone="success">A new code has been sent.</Alert>}
        <Alert tone="error">{error}</Alert>

        <Button type="submit" text="Verify" loading={isLoading} disabled={!isComplete} />
      </form>

      <div className="flex items-center justify-between mt-5 text-sm">
        <button
          type="button"
          className="text-ac-muted hover:text-ac-fg hover:underline underline-offset-4"
          onClick={() => setFlow({ screen: backScreen })}
        >
          Back
        </button>

        {countdown > 0 ? (
          <span className="text-ac-muted">
            Resend in <span className="tabular-nums">{countdown}s</span>
          </span>
        ) : (
          <button
            type="button"
            className="font-medium text-ac-fg hover:underline underline-offset-4 disabled:opacity-50"
            onClick={handleResend}
            disabled={isLoading}
          >
            Resend code
          </button>
        )}
      </div>
    </AuthCard>
  )
}
