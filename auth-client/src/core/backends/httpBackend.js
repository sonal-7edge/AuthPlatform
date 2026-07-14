import { AUTH_ENDPOINTS } from '../constants'
import { handleErrorResponse } from '../handleErrorResponse'

/**
 * Wraps a configured axios instance (see httpClient.js) into the named
 * method shape createAuthClient expects, normalising errors on the way out.
 */
export function createHttpBackend(http) {
  async function call(url, payload) {
    try {
      const { data } = await http.post(url, payload)
      return { error: false, data }
    } catch (error) {
      return handleErrorResponse(error)
    }
  }

  return {
    signUp: (payload) => call(AUTH_ENDPOINTS.SIGN_UP, payload),
    signIn: (payload) => call(AUTH_ENDPOINTS.SIGN_IN, payload),
    verifyOtp: (payload) => call(AUTH_ENDPOINTS.VERIFY_OTP, payload),
    resendOtp: (payload) => call(AUTH_ENDPOINTS.RESEND_OTP, payload),
    forgotPassword: (payload) => call(AUTH_ENDPOINTS.FORGOT_PASSWORD, payload),
    verifyResetOtp: (payload) => call(AUTH_ENDPOINTS.VERIFY_RESET_OTP, payload),
    resetPassword: (payload) => call(AUTH_ENDPOINTS.RESET_PASSWORD, payload),
    changePassword: (payload) => call(AUTH_ENDPOINTS.CHANGE_PASSWORD, payload),
    deleteAccount: (payload) => call(AUTH_ENDPOINTS.DELETE_ACCOUNT, payload),
    fetchTokens: (payload) => call(AUTH_ENDPOINTS.TOKENS, payload),
    refreshToken: (payload) => call(AUTH_ENDPOINTS.REFRESH, payload),
    signOut: (payload) => call(AUTH_ENDPOINTS.LOGOUT, payload),
  }
}
