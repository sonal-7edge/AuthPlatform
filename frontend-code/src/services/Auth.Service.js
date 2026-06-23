import axios from 'axios'
import { handleErrorResponse } from '../helpers/handleErrorResponse'
import { AuthMockService } from './Auth.Mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

async function SignUp(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/signup`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function SignIn(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/signin`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function VerifyOtp(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/verify-otp`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function ForgotPassword(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/forgot-password`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function VerifyResetOtp(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/verify-reset-otp`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function ResetPassword(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/reset-password`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function ChangePassword(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/change-password`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function DeleteAccount(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/delete-account`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function FetchTokens(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/tokens`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function RefreshToken(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

async function SignOut(payload) {
  try {
    const { data } = await axios.post(`${baseURL}/auth/logout`, payload)
    return { error: false, data }
  } catch (error) {
    return handleErrorResponse(error)
  }
}

export const AuthService = USE_MOCK
  ? AuthMockService
  : { SignUp, SignIn, VerifyOtp, ForgotPassword, VerifyResetOtp, ResetPassword, ChangePassword, DeleteAccount, FetchTokens, RefreshToken, SignOut }
