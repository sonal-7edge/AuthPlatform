import { useDispatch, useSelector } from 'react-redux'
import {
  SignInAction,
  SignUpAction,
  VerifyOtpAction,
  ForgotPasswordAction,
  VerifyResetOtpAction,
  ResetPasswordAction,
  ChangePasswordAction,
  DeleteAccountAction,
  FetchTokensAction,
  RefreshTokenAction,
  SignOutAction,
  setScreen,
} from '../pages/Auth/AuthSlice'

export function useAuth() {
  const dispatch = useDispatch()
  const authState = useSelector((state) => state.authStore)

  return {
    ...authState,
    signIn: (payload) => dispatch(SignInAction(payload)),
    signUp: (payload) => dispatch(SignUpAction(payload)),
    verifyOtp: (payload) => dispatch(VerifyOtpAction(payload)),
    forgotPassword: (payload) => dispatch(ForgotPasswordAction(payload)),
    verifyResetOtp: (payload) => dispatch(VerifyResetOtpAction(payload)),
    resetPassword: (payload) => dispatch(ResetPasswordAction(payload)),
    changePassword: (payload) => dispatch(ChangePasswordAction(payload)),
    deleteAccount: (payload) => dispatch(DeleteAccountAction(payload)),
    fetchTokens: () => dispatch(FetchTokensAction()),
    refreshToken: () => dispatch(RefreshTokenAction()),
    signOut: () => dispatch(SignOutAction()),
    setScreen: (screen) => dispatch(setScreen(screen)),
  }
}
