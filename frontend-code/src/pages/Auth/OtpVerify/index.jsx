import { useState, useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import Button from '../../../components/Button'
import { VerifyOtpAction, VerifyResetOtpAction, ResendOtpAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS, IDENTIFIER_TYPE, OTP_LENGTH, OTP_PURPOSE } from '../../../constants/authConstants'

const RESEND_SECONDS = 60

export default function OtpVerify() {
  const dispatch = useDispatch()
  const { isLoading, error, pendingIdentifier, identifierType, otpPurpose } = useSelector(
    (state) => state.authStore
  )

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS)
  const [resendSuccess, setResendSuccess] = useState(false)
  const inputRefs = useRef([])
  const timerRef = useRef(null)

  useEffect(() => {
    inputRefs.current[0]?.focus()
    startCountdown()
    return () => clearInterval(timerRef.current)
  }, [])

  function startCountdown() {
    clearInterval(timerRef.current)
    setResendCountdown(RESEND_SECONDS)
    timerRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const submitOtp = useCallback((otp) => {
    const payload = { identifier: pendingIdentifier, otp }
    if (otpPurpose === OTP_PURPOSE.PASSWORD_RESET) {
      dispatch(VerifyResetOtpAction(payload))
    } else {
      dispatch(VerifyOtpAction(payload))
    }
  }, [dispatch, pendingIdentifier, otpPurpose])

  function handleChange(index, value) {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)
    if (char && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus()
    if (char && index === OTP_LENGTH - 1) {
      const full = next.join('')
      if (full.length === OTP_LENGTH) submitOtp(full)
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
    if (pasted.length === OTP_LENGTH) submitOtp(pasted)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) return
    submitOtp(otp)
  }

  async function handleResend() {
    setResendSuccess(false)
    const result = await dispatch(ResendOtpAction({ identifier: pendingIdentifier, purpose: otpPurpose }))
    if (ResendOtpAction.fulfilled.match(result)) {
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
      setResendSuccess(true)
      startCountdown()
      setTimeout(() => setResendSuccess(false), 4000)
    }
  }

  const otp = digits.join('')
  const contactLabel = identifierType === IDENTIFIER_TYPE.PHONE ? 'phone' : 'email'
  const backScreen = otpPurpose === OTP_PURPOSE.PASSWORD_RESET
    ? AUTH_SCREENS.FORGOT_PASSWORD
    : AUTH_SCREENS.SIGN_IN

  return (
    <AuthCard
      title={otpPurpose === OTP_PURPOSE.PASSWORD_RESET ? 'Verify to reset' : `Verify your ${contactLabel}`}
      subtitle={`We sent a ${OTP_LENGTH}-digit code to ${pendingIdentifier || `your ${contactLabel}`}`}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-11 h-14 text-center text-xl font-semibold rounded-xl border-2 outline-none
                caret-transparent transition-all
                ${d ? 'border-primary bg-primary/5 text-gray-900' : 'border-gray-300 text-gray-900'}
                focus:border-primary focus:ring-2 focus:ring-primary/20`}
            />
          ))}
        </div>

        {resendSuccess && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            A new code has been sent.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4 text-center">
            {error}
          </p>
        )}

        <Button
          type="submit"
          text="Verify OTP"
          loading={isLoading}
          disabled={otp.length < OTP_LENGTH}
        />
      </form>

      <div className="flex items-center justify-between mt-5 text-sm text-gray-500">
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => dispatch(setScreen(backScreen))}
        >
          ← Back
        </button>

        {resendCountdown > 0 ? (
          <span className="text-gray-400">
            Resend in <span className="tabular-nums">{resendCountdown}s</span>
          </span>
        ) : (
          <button
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark disabled:opacity-50"
            onClick={handleResend}
            disabled={isLoading}
          >
            Resend OTP
          </button>
        )}
      </div>
    </AuthCard>
  )
}
