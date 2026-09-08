// Flow orchestrator
export { default as AuthFlow } from './AuthFlow'

// Screens — pre-auth
export { default as SignIn } from './screens/SignIn'
export { default as SignUp } from './screens/SignUp'
export { default as OtpVerify } from './screens/OtpVerify'
export { default as ForgotPassword } from './screens/ForgotPassword'
export { default as ResetPassword } from './screens/ResetPassword'

// Screens — post-auth (compose these into your own routes)
export { default as ChangePassword } from './screens/ChangePassword'
export { default as DeleteAccount } from './screens/DeleteAccount'

// Primitives
export { default as AuthCard } from './components/AuthCard'
export { default as Button } from './components/Button'
export { default as FormField, inputClassName } from './components/FormField'
export { default as PasswordField } from './components/PasswordField'
export { default as IdentifierInput } from './components/IdentifierInput'
export { default as LoadingSpinner } from './components/LoadingSpinner'
export { default as Alert } from './components/Alert'

// Theming
export { DEFAULT_THEME, applyTheme, resetTheme } from './theme'

// Validation helpers, so custom screens match the built-in rules
export {
  MIN_PASSWORD_LENGTH,
  validateIdentifier,
  validatePassword,
  validateConfirmation,
} from './validation'

export { AUTH_SCREENS } from './constants'
