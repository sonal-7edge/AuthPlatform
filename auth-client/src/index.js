/**
 * auth-client — single entry point.
 *
 * Everything the library offers is exported from here: the headless client
 * (`login`, `logout`, `signUp`, `refreshToken`, …), the React bindings, and
 * the prebuilt screens.
 *
 *   import { createAuthClient, AuthProvider, useAuth, AuthFlow } from 'auth-client'
 *   import 'auth-client/style.css'
 *
 * The `auth-client/react` and `auth-client/ui` subpaths still resolve for
 * existing importers. `auth-client/core` is the one meaningful subpath: it
 * carries no React import at all, for Node scripts and non-React hosts.
 */

// ── Core: headless client ────────────────────────────────────────────────
export { createAuthClient } from './core/createAuthClient'
export { createTokenStore, normalizeTokens, toPublicTokens } from './core/storage'
export { createTokenManager } from './core/tokenManager'
export { createHttpClient } from './core/httpClient'
export { createBroadcaster } from './core/broadcast'
export { createHttpBackend } from './core/backends/httpBackend'
export { handleErrorResponse } from './core/handleErrorResponse'
export { decodeJWT, isExpired, secondsUntilExpiry } from './core/jwt'
export {
  AUTH_ENDPOINTS,
  DEFAULT_STORAGE_KEYS,
  IDENTIFIER_TYPE,
  OTP_PURPOSE,
  OTP_LENGTH,
  AUTH_CHANNEL,
  BROADCAST_EVENTS,
  BROADCAST_FALLBACK_KEYS,
  DEFAULT_EXPIRY_SKEW_SECONDS,
} from './core/constants'

// ── React bindings ───────────────────────────────────────────────────────
export { AuthProvider, AuthContext } from './react/AuthProvider'
export { useAuth } from './react/useAuth'

// ── Prebuilt UI ──────────────────────────────────────────────────────────
export {
  AuthFlow,
  SignIn,
  SignUp,
  OtpVerify,
  ForgotPassword,
  ResetPassword,
  ChangePassword,
  DeleteAccount,
  AuthCard,
  Button,
  FormField,
  PasswordField,
  IdentifierInput,
  LoadingSpinner,
  Alert,
  inputClassName,
  DEFAULT_THEME,
  applyTheme,
  resetTheme,
  MIN_PASSWORD_LENGTH,
  validateIdentifier,
  validatePassword,
  validateConfirmation,
  AUTH_SCREENS,
} from './ui/index'
