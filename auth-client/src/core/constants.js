/**
 * Storage keys. Tokens live in a single JSON blob (not one key per token) so a
 * refresh swaps the whole bundle atomically — same shape the ORDO host app
 * persists under its `tokens` key.
 */
export const DEFAULT_STORAGE_KEYS = {
  TOKENS: 'auth_tokens',
  USER: 'auth_user',
  USERNAME: 'auth_username',
}

/**
 * The backend contract, as specified by the platform API. Every route is a
 * POST under `baseURL`. Override individual entries via the `endpoints` config
 * if a deployment differs.
 */
export const AUTH_ENDPOINTS = {
  SIGN_UP: '/auth/signup',
  SIGN_IN: '/auth/signin',
  VERIFY_OTP: '/auth/verify-otp',
  RESEND_OTP: '/auth/resend-otp',
  FORGOT_PASSWORD: '/auth/forgot-password',
  VERIFY_RESET_OTP: '/auth/verify-reset-otp',
  RESET_PASSWORD: '/auth/reset-password',
  CHANGE_PASSWORD: '/auth/change-password',
  DELETE_ACCOUNT: '/auth/delete-account',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
}

export const IDENTIFIER_TYPE = {
  EMAIL: 'email',
  PHONE: 'phone',
}

export const OTP_PURPOSE = {
  AUTH: 'auth',
  PASSWORD_RESET: 'password-reset',
}

export const OTP_LENGTH = 6

/** BroadcastChannel name — matches ORDO's so host and library share one bus. */
export const AUTH_CHANNEL = 'auth'

export const BROADCAST_EVENTS = {
  TOKEN_REFRESHED: 'token_refreshed',
  LOGOUT: 'logout',
  LOGIN: 'login',
  NEED_REFRESH: 'need_refresh',
}

/** localStorage sentinel keys used when BroadcastChannel is unavailable. */
export const BROADCAST_FALLBACK_KEYS = {
  TOKEN_REFRESHED: 'token_refreshed_at',
  LOGOUT: 'logout',
  LOGIN: 'login_at',
}

/**
 * Refresh a token this many seconds before it actually expires, so a request
 * in flight can't be overtaken by the expiry. ORDO uses 30s.
 */
export const DEFAULT_EXPIRY_SKEW_SECONDS = 30
