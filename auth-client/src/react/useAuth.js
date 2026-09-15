import { useContext, useSyncExternalStore } from 'react'
import { AuthContext } from './AuthProvider'

/**
 * Reactive binding over an auth client: re-renders when its state changes and
 * exposes the same methods (`login`, `logout`, `signUp`, `refreshToken`, ...)
 * bound to that client. Must be used inside an `<AuthProvider>`.
 *
 * The methods are stable identities owned by the client, so they are safe to
 * use in dependency arrays without memoising.
 */
export function useAuth() {
  const client = useContext(AuthContext)
  if (!client) {
    throw new Error(
      'useAuth() must be used within an <AuthProvider>. Wrap your app root in <AuthProvider config={{ ... }}>.'
    )
  }

  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState)

  return {
    // state: isAuthenticated, user, idToken, accessToken, isLoading, error
    //
    // Note the refresh token is NOT on state — `refreshToken` below is the
    // method that renews the session. Read the value with getRefreshToken().
    ...state,
    // session
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
    signOut: client.signOut,
    logout: client.logout,
    // tokens
    refreshToken: client.refreshToken,
    getTokens: client.getTokens,
    getIdToken: client.getIdToken,
    getAccessToken: client.getAccessToken,
    getRefreshToken: client.getRefreshToken,
    getValidToken: client.getValidToken,
    expiresIn: client.expiresIn,
    // escape hatch for advanced use
    client,
  }
}
