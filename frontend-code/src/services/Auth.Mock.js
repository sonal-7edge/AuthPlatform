const delay = (ms = 800) => new Promise((res) => setTimeout(res, ms))

const MOCK_USER = {
  id: 'usr_mock_001',
  firstName: 'Jane',
  lastName: 'Doe',
  name: 'Jane Doe',
  email: '',
}

const MOCK_TOKENS = {
  idToken:
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfbW9ja18wMDEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJuYW1lIjoiSmFuZSBEb2UiLCJpYXQiOjE3MTcwMDAwMDAsImV4cCI6MTcxNzAwMzYwMH0.MOCK_SIGNATURE',
  refreshToken:
    'rt_mock_8f14e45f-ceea-467a-a866-1b1f21d791a1_refresh_token_placeholder',
}

const MOCK_OTP = '123456'
const MOCK_RESET_TOKEN = 'rst_mock_token_abc123'

export const AuthMockService = {
  async SignUp(payload) {
    await delay()
    return { error: false, data: { message: 'OTP sent to your email' } }
  },

  async SignIn(payload) {
    await delay()
    const identifier = payload.email || payload.phone
    if (identifier === 'fail@test.com' || identifier === '0000000000') {
      return { error: true, message: 'Invalid credentials', status: 401 }
    }
    return { error: false, data: { message: 'OTP sent to your registered contact' } }
  },

  async VerifyOtp(payload) {
    await delay()
    if (payload.otp !== MOCK_OTP) {
      return { error: true, message: `Invalid OTP. Use "${MOCK_OTP}" in mock mode.`, status: 400 }
    }
    return {
      error: false,
      data: {
        ...MOCK_TOKENS,
        user: { ...MOCK_USER, email: payload.identifier },
      },
    }
  },

  async ForgotPassword(payload) {
    await delay()
    return { error: false, data: { message: 'Password reset OTP sent' } }
  },

  async VerifyResetOtp(payload) {
    await delay()
    if (payload.otp !== MOCK_OTP) {
      return { error: true, message: `Invalid OTP. Use "${MOCK_OTP}" in mock mode.`, status: 400 }
    }
    return { error: false, data: { resetToken: MOCK_RESET_TOKEN } }
  },

  async ResetPassword(payload) {
    await delay()
    return { error: false, data: { message: 'Password reset successfully' } }
  },

  async ChangePassword(payload) {
    await delay()
    if (payload.currentPassword === 'wrongpassword') {
      return { error: true, message: 'Current password is incorrect', status: 400 }
    }
    return { error: false, data: { message: 'Password changed successfully' } }
  },

  async DeleteAccount(payload) {
    await delay()
    if (payload.password === 'wrongpassword') {
      return { error: true, message: 'Incorrect password', status: 400 }
    }
    return { error: false, data: { message: 'Account deleted successfully' } }
  },

  async FetchTokens() {
    await delay(400)
    return { error: false, data: { ...MOCK_TOKENS } }
  },

  async RefreshToken() {
    await delay(400)
    return {
      error: false,
      data: {
        idToken: MOCK_TOKENS.idToken + '_refreshed',
        refreshToken: MOCK_TOKENS.refreshToken + '_new',
      },
    }
  },

  async SignOut() {
    await delay(300)
    return { error: false, data: { message: 'Signed out' } }
  },
}
