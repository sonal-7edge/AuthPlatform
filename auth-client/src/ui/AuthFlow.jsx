import { useState } from 'react'
import { useAuth } from '../react/useAuth'
import SignIn from './screens/SignIn'
import SignUp from './screens/SignUp'
import OtpVerify from './screens/OtpVerify'
import ForgotPassword from './screens/ForgotPassword'
import ResetPassword from './screens/ResetPassword'
import { AUTH_SCREENS } from './constants'
import { IDENTIFIER_TYPE, OTP_PURPOSE } from '../core/constants'

/**
 * Drop-in pre-auth journey: sign in, sign up, OTP verification, forgot/reset
 * password. Renders nothing once the user is authenticated — read
 * `isAuthenticated` from useAuth() in the host app to swap to the real app,
 * or pass `onAuthenticated` to be notified the moment sign-in completes.
 *
 * Screens that belong to an already-authenticated area (ChangePassword,
 * DeleteAccount) are exported separately — compose them into your own
 * app routes instead.
 */
export default function AuthFlow({ initialScreen = AUTH_SCREENS.SIGN_IN, onAuthenticated }) {
  const { clearError } = useAuth()
  const [flow, setFlowState] = useState({
    screen: initialScreen,
    pendingIdentifier: null,
    identifierType: IDENTIFIER_TYPE.EMAIL,
    otpPurpose: OTP_PURPOSE.AUTH,
    resetToken: null,
    notice: null,
  })

  function setFlow(patch) {
    // Changing screen dismisses the previous screen's error — otherwise a
    // failed sign-in is still showing after the user switches to sign-up.
    if (patch.screen && patch.screen !== flow.screen) clearError()
    // A one-shot notice (e.g. "account verified") must not survive the next
    // navigation, so clear it unless this patch is the one setting it.
    setFlowState((f) => ({ ...f, notice: null, ...patch }))
  }

  const props = { flow, setFlow, onAuthenticated }

  switch (flow.screen) {
    case AUTH_SCREENS.SIGN_UP:
      return <SignUp {...props} />
    case AUTH_SCREENS.OTP:
    case AUTH_SCREENS.RESET_PASSWORD_OTP:
      return <OtpVerify {...props} />
    case AUTH_SCREENS.FORGOT_PASSWORD:
      return <ForgotPassword {...props} />
    case AUTH_SCREENS.RESET_PASSWORD:
      return <ResetPassword {...props} />
    default:
      return <SignIn {...props} />
  }
}
