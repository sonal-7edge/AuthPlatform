import { AUTH_ENDPOINTS } from '../constants'
import { handleErrorResponse } from '../handleErrorResponse'

/**
 * Wraps a configured axios instance (see httpClient.js) into the named method
 * shape `createAuthClient` expects, normalising errors on the way out.
 * Authenticated routes need no extra argument — the Bearer header is injected
 * by the request interceptor.
 *
 * @param {import('axios').AxiosInstance} http
 * @param {{ endpoints?: Partial<typeof AUTH_ENDPOINTS> }} [options]
 */
export function createHttpBackend(http, { endpoints } = {}) {
  const routes = { ...AUTH_ENDPOINTS, ...endpoints }

  async function post(url, payload) {
    try {
      const { data } = await http.post(url, payload)
      return { error: false, data }
    } catch (error) {
      return handleErrorResponse(error)
    }
  }

  return {
    signUp: (payload) => post(routes.SIGN_UP, payload),
    signIn: (payload) => post(routes.SIGN_IN, payload),
    verifyOtp: (payload) => post(routes.VERIFY_OTP, payload),
    resendOtp: (payload) => post(routes.RESEND_OTP, payload),
    forgotPassword: (payload) => post(routes.FORGOT_PASSWORD, payload),
    verifyResetOtp: (payload) => post(routes.VERIFY_RESET_OTP, payload),
    resetPassword: (payload) => post(routes.RESET_PASSWORD, payload),
    changePassword: (payload) => post(routes.CHANGE_PASSWORD, payload),
    deleteAccount: (payload) => post(routes.DELETE_ACCOUNT, payload),
    refreshToken: (payload) => post(routes.REFRESH, payload),
    signOut: (payload) => post(routes.LOGOUT, payload),
  }
}
