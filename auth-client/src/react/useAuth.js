import { useContext, useSyncExternalStore } from 'react'
import { AuthContext } from './AuthProvider'

/**
 * Reactive binding over an auth client: re-renders when its state changes,
 * and exposes the same methods (login, logout, signUp, verifyOtp, ...)
 * bound to that client. Must be used within an <AuthProvider>.
 */
export function useAuth() {
  const client = useContext(AuthContext)
  if (!client) {
    throw new Error('useAuth() must be used within an <AuthProvider>')
  }

  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState)

  return {
    ...state,
    signUp: client.signUp,
    signIn: client.signIn,
    login: client.login,
    verifyOtp: client.verifyOtp,
    resendOtp: client.resendOtp,
    forgotPassword: client.forgotPassword,
    verifyResetOtp: client.verifyResetOtp,
    resetPassword: client.resetPassword,
    changePassword: client.changePassword,
    deleteAccount: client.deleteAccount,
    fetchTokens: client.fetchTokens,
    refreshToken: client.refreshToken,
    signOut: client.signOut,
    logout: client.logout,
  }
}
