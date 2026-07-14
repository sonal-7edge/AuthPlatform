import { createHttpClient } from './httpClient'
import { createTokenStore } from './storage'
import { createHttpBackend } from './backends/httpBackend'
import { createMockBackend } from './backends/mockBackend'

/**
 * Creates a headless, framework-agnostic auth client: call its methods
 * directly (login, logout, signUp, ...), or subscribe to state changes.
 * No Redux, no React — those are optional layers built on top of this.
 *
 * @param {{
 *   baseURL?: string,
 *   useMock?: boolean,
 *   storage?: { getItem, setItem, removeItem },
 *   storageKeys?: object,
 *   onForceLogout?: () => void,
 * }} [config]
 */
export function createAuthClient(config = {}) {
  const { baseURL = '', useMock = false, storage, storageKeys, onForceLogout } = config

  const tokenStore = createTokenStore({ storage, keys: storageKeys })

  let state = {
    isAuthenticated: tokenStore.isAuthenticated(),
    user: tokenStore.getUser(),
    idToken: tokenStore.getIdToken(),
    refreshToken: tokenStore.getRefreshToken(),
    isLoading: false,
    error: null,
  }
  const listeners = new Set()

  function getState() {
    return state
  }

  function setState(patch) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(state))
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function clearSession() {
    tokenStore.clear()
    setState({ isAuthenticated: false, user: null, idToken: null, refreshToken: null })
  }

  function forceLogout() {
    clearSession()
    onForceLogout?.()
  }

  async function runAction(fn) {
    setState({ isLoading: true, error: null })
    const result = await fn()
    setState({ isLoading: false, error: result.error ? result.message : null })
    return result
  }

  const backend = useMock
    ? createMockBackend()
    : createHttpBackend(
        createHttpClient({
          baseURL,
          tokenStore,
          onRefreshToken: () => refreshToken(),
          onForceLogout: forceLogout,
        })
      )

  function signUp(payload) {
    return runAction(() => backend.signUp(payload))
  }

  function signIn(payload) {
    return runAction(() => backend.signIn(payload))
  }

  function verifyOtp(payload) {
    return runAction(async () => {
      const result = await backend.verifyOtp(payload)
      if (!result.error) {
        tokenStore.saveTokens(result.data)
        tokenStore.saveUser(result.data.user)
        setState({
          isAuthenticated: true,
          user: result.data.user,
          idToken: result.data.idToken,
          refreshToken: result.data.refreshToken,
        })
      }
      return result
    })
  }

  function resendOtp(payload) {
    return runAction(() => backend.resendOtp(payload))
  }

  function forgotPassword(payload) {
    return runAction(() => backend.forgotPassword(payload))
  }

  function verifyResetOtp(payload) {
    return runAction(() => backend.verifyResetOtp(payload))
  }

  function resetPassword(payload) {
    return runAction(() => backend.resetPassword(payload))
  }

  function changePassword(payload) {
    return runAction(() => backend.changePassword(payload))
  }

  function deleteAccount(payload) {
    return runAction(async () => {
      const result = await backend.deleteAccount(payload)
      clearSession()
      return result
    })
  }

  function fetchTokens() {
    return runAction(async () => {
      const result = await backend.fetchTokens({ email: state.user?.email })
      if (!result.error) {
        tokenStore.saveTokens(result.data)
        setState({ idToken: result.data.idToken, refreshToken: result.data.refreshToken })
      }
      return result
    })
  }

  function refreshToken() {
    return runAction(async () => {
      const result = await backend.refreshToken({ refreshToken: tokenStore.getRefreshToken() })
      if (result.error) {
        forceLogout()
        return result
      }
      tokenStore.saveTokens(result.data)
      setState({ idToken: result.data.idToken, refreshToken: result.data.refreshToken })
      return result
    })
  }

  function signOut() {
    return runAction(async () => {
      const result = await backend.signOut({ refreshToken: tokenStore.getRefreshToken() })
      clearSession()
      return result
    })
  }

  return {
    getState,
    subscribe,
    signUp,
    signIn,
    login: signIn,
    verifyOtp,
    resendOtp,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    changePassword,
    deleteAccount,
    fetchTokens,
    refreshToken,
    signOut,
    logout: signOut,
  }
}
