// Auth barrel — import everything auth-related from './auth'.

export { AuthProvider, useAuth, decodeJWT, applyTheme } from '@7edge/auth-client'
export { authConfig, API_BASE_URL } from '@7edge/auth-client/config'

export { default as AuthFlow } from './AuthFlow'
export { default as SignIn } from './screens/SignIn'
export { default as SignUp } from './screens/SignUp'
export { default as OtpVerify } from './screens/OtpVerify'
export { default as ForgotPassword } from './screens/ForgotPassword'
export { default as ResetPassword } from './screens/ResetPassword'
export { default as ChangePassword } from './screens/ChangePassword'
export { default as DeleteAccount } from './screens/DeleteAccount'
