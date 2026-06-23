import { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import AuthCard from '../../../components/AuthCard'
import Button from '../../../components/Button'
import { VerifyOtpAction, VerifyResetOtpAction, setScreen } from '../AuthSlice'
import { AUTH_SCREENS, IDENTIFIER_TYPE, OTP_LENGTH, OTP_PURPOSE } from '../../../constants/authConstants'

export default function OtpVerify() {
  const dispatch = useDispatch()
  const { isLoading, error, pendingIdentifier, identifierType, otpPurpose } = useSelector(
    (state) => state.authStore
  )

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const inputRefs = useRef([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  function handleChange(index, value) {
    const char = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)
    if (char && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus()
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
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
  }

  function handleSubmit(e) {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) return
    const payload = { identifier: pendingIdentifier, otp }
    if (otpPurpose === OTP_PURPOSE.PASSWORD_RESET) {
      dispatch(VerifyResetOtpAction(payload))
    } else {
      dispatch(VerifyOtpAction(payload))
    }
  }

  const otp = digits.join('')
  const contactLabel = identifierType === IDENTIFIER_TYPE.PHONE ? 'phone' : 'email'
  const backScreen = otpPurpose === OTP_PURPOSE.PASSWORD_RESET
    ? AUTH_SCREENS.FORGOT_PASSWORD
    : AUTH_SCREENS.SIGN_IN

  return (
    <AuthCard
      title={otpPurpose === OTP_PURPOSE.PASSWORD_RESET ? 'Verify to reset' : 'Verify your ' + contactLabel}
      subtitle={`We sent a ${OTP_LENGTH}-digit code to ${pendingIdentifier || 'your ' + contactLabel}`}
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

      <p className="text-center mt-5 text-sm text-gray-500">
        Wrong {contactLabel}?{' '}
        <button
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          onClick={() => dispatch(setScreen(backScreen))}
        >
          Go back
        </button>
      </p>
    </AuthCard>
  )
}
