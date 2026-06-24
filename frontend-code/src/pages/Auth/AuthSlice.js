import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { AuthService } from '../../services/Auth.Service'
import { tokenManager } from '../../helpers/tokenManager'
import { AUTH_SCREENS, IDENTIFIER_TYPE, OTP_PURPOSE } from '../../constants/authConstants'

const initialState = {
  isAuthenticated: tokenManager.isAuthenticated(),
  idToken: tokenManager.getIdToken(),
  refreshToken: tokenManager.getRefreshToken(),
  user: tokenManager.getUser(),
  isLoading: false,
  error: null,
  screen: AUTH_SCREENS.SIGN_IN,
  pendingIdentifier: null,
  identifierType: IDENTIFIER_TYPE.EMAIL,
  otpPurpose: OTP_PURPOSE.AUTH,
  resetToken: null,
}

export const SignUpAction = createAsyncThunk(
  'auth/signUp',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.SignUp(payload)
    if (result.error) return rejectWithValue(result.message)
    return { identifier: payload.email || payload.phone, identifierType: payload.email ? IDENTIFIER_TYPE.EMAIL : IDENTIFIER_TYPE.PHONE }
  }
)

export const SignInAction = createAsyncThunk(
  'auth/signIn',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.SignIn(payload)
    if (result.error) return rejectWithValue(result.message)
    return { identifier: payload.email || payload.phone, identifierType: payload.email ? IDENTIFIER_TYPE.EMAIL : IDENTIFIER_TYPE.PHONE }
  }
)

export const VerifyOtpAction = createAsyncThunk(
  'auth/verifyOtp',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.VerifyOtp(payload)
    if (result.error) return rejectWithValue(result.message)
    tokenManager.saveTokens(result.data)
    tokenManager.saveUser(result.data.user)
    return result.data
  }
)

export const ForgotPasswordAction = createAsyncThunk(
  'auth/forgotPassword',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.ForgotPassword(payload)
    if (result.error) return rejectWithValue(result.message)
    return { identifier: payload.identifier, identifierType: payload.identifierType }
  }
)

export const VerifyResetOtpAction = createAsyncThunk(
  'auth/verifyResetOtp',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.VerifyResetOtp(payload)
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

export const ResetPasswordAction = createAsyncThunk(
  'auth/resetPassword',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.ResetPassword(payload)
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

export const ChangePasswordAction = createAsyncThunk(
  'auth/changePassword',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.ChangePassword(payload)
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

export const DeleteAccountAction = createAsyncThunk(
  'auth/deleteAccount',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.DeleteAccount(payload)
    tokenManager.clear()
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

export const ResendOtpAction = createAsyncThunk(
  'auth/resendOtp',
  async (payload, { rejectWithValue }) => {
    const result = await AuthService.ResendOtp(payload)
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

export const FetchTokensAction = createAsyncThunk(
  'auth/fetchTokens',
  async (_, { getState, rejectWithValue }) => {
    const { user } = getState().authStore
    const result = await AuthService.FetchTokens({ email: user?.email })
    if (result.error) return rejectWithValue(result.message)
    tokenManager.saveTokens(result.data)
    return result.data
  }
)

export const RefreshTokenAction = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    const result = await AuthService.RefreshToken({
      refreshToken: tokenManager.getRefreshToken(),
    })
    if (result.error) return rejectWithValue(result.message)
    tokenManager.saveTokens(result.data)
    return result.data
  }
)

export const SignOutAction = createAsyncThunk(
  'auth/signOut',
  async (_, { rejectWithValue }) => {
    const result = await AuthService.SignOut({
      refreshToken: tokenManager.getRefreshToken(),
    })
    tokenManager.clear()
    if (result.error) return rejectWithValue(result.message)
    return result.data
  }
)

const clearAuthState = () => ({
  ...initialState,
  isAuthenticated: false,
  idToken: null,
  refreshToken: null,
  user: null,
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setScreen(state, action) {
      state.screen = action.payload
      state.error = null
    },
    resetAuth() {
      return clearAuthState()
    },
  },
  extraReducers: (builder) => {
    // SignUp
    builder
      .addCase(SignUpAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(SignUpAction.fulfilled, (state, action) => {
        state.isLoading = false
        state.pendingIdentifier = action.payload.identifier
        state.identifierType = action.payload.identifierType
        state.otpPurpose = OTP_PURPOSE.AUTH
        state.screen = AUTH_SCREENS.OTP
      })
      .addCase(SignUpAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // SignIn
    builder
      .addCase(SignInAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(SignInAction.fulfilled, (state, action) => {
        state.isLoading = false
        state.pendingIdentifier = action.payload.identifier
        state.identifierType = action.payload.identifierType
        state.otpPurpose = OTP_PURPOSE.AUTH
        state.screen = AUTH_SCREENS.OTP
      })
      .addCase(SignInAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // VerifyOtp (auth)
    builder
      .addCase(VerifyOtpAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(VerifyOtpAction.fulfilled, (state, action) => {
        state.isLoading = false
        state.isAuthenticated = true
        state.idToken = action.payload.idToken
        state.refreshToken = action.payload.refreshToken
        state.user = action.payload.user
        state.pendingIdentifier = null
        state.screen = AUTH_SCREENS.SIGN_IN
      })
      .addCase(VerifyOtpAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // ForgotPassword
    builder
      .addCase(ForgotPasswordAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(ForgotPasswordAction.fulfilled, (state, action) => {
        state.isLoading = false
        state.pendingIdentifier = action.payload.identifier
        state.identifierType = action.payload.identifierType
        state.otpPurpose = OTP_PURPOSE.PASSWORD_RESET
        state.screen = AUTH_SCREENS.RESET_PASSWORD_OTP
      })
      .addCase(ForgotPasswordAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // VerifyResetOtp
    builder
      .addCase(VerifyResetOtpAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(VerifyResetOtpAction.fulfilled, (state, action) => {
        state.isLoading = false
        state.resetToken = action.payload.resetToken
        state.screen = AUTH_SCREENS.RESET_PASSWORD
      })
      .addCase(VerifyResetOtpAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // ResetPassword
    builder
      .addCase(ResetPasswordAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(ResetPasswordAction.fulfilled, (state) => {
        state.isLoading = false
        state.resetToken = null
        state.pendingIdentifier = null
        state.screen = AUTH_SCREENS.SIGN_IN
      })
      .addCase(ResetPasswordAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // ChangePassword
    builder
      .addCase(ChangePasswordAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(ChangePasswordAction.fulfilled, (state) => {
        state.isLoading = false
        state.screen = AUTH_SCREENS.SIGN_IN
      })
      .addCase(ChangePasswordAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // DeleteAccount
    builder
      .addCase(DeleteAccountAction.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(DeleteAccountAction.fulfilled, () => clearAuthState())
      .addCase(DeleteAccountAction.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // FetchTokens
    builder
      .addCase(FetchTokensAction.fulfilled, (state, action) => {
        state.idToken = action.payload.idToken
        state.refreshToken = action.payload.refreshToken
      })
      .addCase(FetchTokensAction.rejected, (state, action) => {
        state.error = action.payload
      })

    // RefreshToken
    builder
      .addCase(RefreshTokenAction.fulfilled, (state, action) => {
        state.idToken = action.payload.idToken
        state.refreshToken = action.payload.refreshToken
      })
      .addCase(RefreshTokenAction.rejected, (state) => {
        state.isAuthenticated = false
        state.idToken = null
        state.refreshToken = null
        state.user = null
      })

    // SignOut
    builder
      .addCase(SignOutAction.pending, (state) => { state.isLoading = true })
      .addCase(SignOutAction.fulfilled, () => clearAuthState())
      .addCase(SignOutAction.rejected, () => clearAuthState())
  },
})

export const { setScreen, resetAuth } = authSlice.actions
export default authSlice.reducer
