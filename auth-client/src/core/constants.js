export const DEFAULT_STORAGE_KEYS = {
  ID_TOKEN: 'auth_id_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER: 'auth_user',
}

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
  TOKENS: '/auth/tokens',
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
