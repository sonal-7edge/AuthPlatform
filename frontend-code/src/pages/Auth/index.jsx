import { useSelector } from 'react-redux'
import SignIn from './SignIn'
import SignUp from './SignUp'
import OtpVerify from './OtpVerify'
import ForgotPassword from './ForgotPassword'
import ResetPassword from './ResetPassword'
import { AUTH_SCREENS } from '../../constants/authConstants'

const SCREEN_MAP = {
  [AUTH_SCREENS.SIGN_IN]: SignIn,
  [AUTH_SCREENS.SIGN_UP]: SignUp,
  [AUTH_SCREENS.OTP]: OtpVerify,
  [AUTH_SCREENS.FORGOT_PASSWORD]: ForgotPassword,
  [AUTH_SCREENS.RESET_PASSWORD_OTP]: OtpVerify,
  [AUTH_SCREENS.RESET_PASSWORD]: ResetPassword,
}

export default function Auth() {
  const { screen } = useSelector((state) => state.authStore)
  const Screen = SCREEN_MAP[screen] || SignIn
  return <Screen />
}
