import { createHttpClient } from './httpClient'
import { createTokenStore, toPublicTokens } from './storage'
import { createTokenManager } from './tokenManager'
import { createBroadcaster } from './broadcast'
import { createHttpBackend } from './backends/httpBackend'
import { BROADCAST_EVENTS, DEFAULT_EXPIRY_SKEW_SECONDS } from './constants'

/**
 * Creates a headless, framework-agnostic auth client. Call its methods
 * directly (`login`, `logout`, `signUp`, `refreshToken`, ...) or subscribe to
 * state changes. No Redux, no React — those are optional layers on top.
 *
 * Token handling matches the ORDO host app: one JSON bundle in storage,
 * proactive refresh inside a 30s expiry skew, a single-flight refresh lock,
 * and cross-tab coordination over the `auth` BroadcastChannel.
 *
 * @param {{
 *   baseURL?: string,
 *   storage?: { getItem, setItem, removeItem },
 *   storageKeys?: object,
 *   endpoints?: object,
 *   headers?: object,
 *   expirySkewSeconds?: number,
 *   crossTab?: boolean,
 *   onForceLogout?: () => void,
 *   onAuthStateChange?: (state: object) => void,
 * }} [config]
 */
export function createAuthClient(config = {}) {
  const {
    baseURL,
    storage,
    storageKeys,
    endpoints,
    headers,
    expirySkewSeconds = DEFAULT_EXPIRY_SKEW_SECONDS,
    crossTab = true,
    onForceLogout,
    onAuthStateChange,
  } = config

  if (!baseURL) {
    throw new Error(
      'createAuthClient requires a baseURL — e.g. createAuthClient({ baseURL: "https://api.example.com/api" }). ' +
      'Without it every request would go to the current origin.'
    )
  }

  const tokenStore = createTokenStore({ storage, keys: storageKeys })
  const broadcaster = createBroadcaster({ enabled: crossTab })
  const listeners = new Set()

  /**
   * The token fields published on state.
   *
   * `refresh_token` is deliberately excluded: `refreshToken` is the *method*
   * name on this client, so publishing the value under the same key would
   * shadow it — and a long-lived credential has no business being rendered
   * into a component tree. Read it explicitly via `getRefreshToken()`.
   */
  function sessionTokens() {
    const { idToken, accessToken } = toPublicTokens(tokenStore.getTokens())
    return { idToken, accessToken }
  }

  function snapshot() {
    return {
      isAuthenticated: tokenStore.isAuthenticated(),
      user: tokenStore.getUser(),
      ...sessionTokens(),
      isLoading: false,
      error: null,
    }
  }

  let state = snapshot()

  function getState() {
    return state
  }

  function setState(patch) {
    // Bail on no-op patches so useSyncExternalStore doesn't re-render for nothing.
    const changed = Object.keys(patch).some((key) => state[key] !== patch[key])
    if (!changed) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(state))
    onAuthStateChange?.(state)
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /** Re-reads storage into state — used after another tab changes the session. */
  function syncFromStorage() {
    setState({
      isAuthenticated: tokenStore.isAuthenticated(),
      user: tokenStore.getUser(),
      ...sessionTokens(),
    })
  }

  function clearSession() {
    tokenStore.clear()
    setState({
      isAuthenticated: false,
      user: null,
      idToken: null,
      accessToken: null,
    })
  }

  function forceLogout() {
    clearSession()
    onForceLogout?.()
  }

  /**
   * Wraps a backend call with the loading/error state transitions every method
   * shares, so `isLoading` and `error` stay correct without repeating it.
   */
  async function runAction(fn) {
    setState({ isLoading: true, error: null })
    try {
      const result = await fn()
      setState({ isLoading: false, error: result.error ? result.message : null })
      return result
    } catch (error) {
      // A backend threw instead of resolving — normalise rather than propagate,
      // so the `{ error }` contract holds for every caller.
      const message = error?.message || 'Something went wrong'
      setState({ isLoading: false, error: message })
      return { error: true, message, code: 'UNEXPECTED' }
    }
  }

  // --- backend + token manager -------------------------------------------
  // Circular by nature: the token manager refreshes *through* the backend,
  // and the HTTP backend's interceptor refreshes *through* the manager.
  // `backend` is declared first and filled in below; `requestRefresh` only
  // dereferences it when a refresh actually runs, long after both exist.
  let backend

  const tokenManager = createTokenManager({
    tokenStore,
    expirySkewSeconds,
    broadcaster,
    requestRefresh: (payload) => backend.refreshToken(payload),
    onRefreshed: () => setState(sessionTokens()),
    onForceLogout: forceLogout,
  })

  backend = createHttpBackend(
    createHttpClient({ baseURL, headers, tokenStore, tokenManager }),
    { endpoints }
  )

  // --- cross-tab coordination --------------------------------------------
  broadcaster.subscribe((message) => {
    switch (message.type) {
      case BROADCAST_EVENTS.TOKEN_REFRESHED:
        // Another tab refreshed. Adopt its bundle instead of refreshing again.
        if (message.tokens) tokenStore.saveTokens(message.tokens)
        syncFromStorage()
        break
      case BROADCAST_EVENTS.LOGOUT:
        clearSession()
        onForceLogout?.()
        break
      case BROADCAST_EVENTS.LOGIN:
        syncFromStorage()
        break
      case BROADCAST_EVENTS.NEED_REFRESH:
        // A sibling (e.g. a microfrontend) hit a 401 and wants us to renew.
        if (!tokenManager.isRefreshing) tokenManager.refresh(true).catch(() => {})
        break
      default:
        break
    }
  })

  /** Identifier of the signed-in user, passed to backend calls that need it. */
  function currentContext() {
    const user = tokenStore.getUser()
    return { identifier: user?.email ?? user?.phone ?? null, user }
  }

  function persistSession(data) {
    // The API returns the user alongside the bundle. Split them: the user
    // belongs under its own key, not inside the token blob where it would be
    // carried forward — stale — through every subsequent refresh.
    const { user, tokens: nested, ...rest } = data
    const tokens = tokenStore.saveTokens(nested ?? rest)
    if (user) tokenStore.saveUser(user)
    setState({
      isAuthenticated: !!tokens?.id_token,
      user: user ?? tokenStore.getUser(),
      ...sessionTokens(),
    })
    return tokens
  }

  // --- public methods -----------------------------------------------------

  function signUp(payload) {
    return runAction(() => backend.signUp(payload))
  }

  /**
   * Signs in and persists the returned bundle. The API authenticates on
   * credentials alone — there is no OTP step in this flow.
   */
  function signIn(payload) {
    return runAction(async () => {
      const result = await backend.signIn(payload)
      if (!result.error) {
        persistSession(result.data)
        broadcaster.post(BROADCAST_EVENTS.LOGIN)
      }
      return result
    })
  }

  /**
   * Confirms a newly registered account with the code sent at sign-up.
   *
   * This does NOT authenticate: the API responds with a message only, and the
   * user signs in afterwards. Password reset uses `verifyResetOtp` instead.
   */
  function verifyOtp(payload) {
    return runAction(() => backend.verifyOtp(payload))
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
    return runAction(() => backend.changePassword(payload, currentContext()))
  }

  function deleteAccount(payload) {
    return runAction(async () => {
      const result = await backend.deleteAccount(payload, currentContext())
      // Only tear the session down if the deletion actually succeeded —
      // a wrong-password rejection must leave the user signed in.
      if (!result.error) {
        clearSession()
        broadcaster.post(BROADCAST_EVENTS.LOGOUT)
      }
      return result
    })
  }

  /** Forces a refresh now. Routed through the manager, so it shares the lock. */
  function refreshToken() {
    return runAction(async () => {
      try {
        const idToken = await tokenManager.refresh(true)
        return { error: false, data: { idToken, ...sessionTokens() } }
      } catch (error) {
        return { error: true, message: error.message, code: 'REFRESH_FAILED' }
      }
    })
  }

  function signOut() {
    return runAction(async () => {
      // Bearer-authenticated with an empty body; the server revokes every
      // refresh token for the user.
      const result = await backend.signOut({})
      // Clear locally regardless: a failed server-side revoke must not strand
      // the user in a half-signed-in state.
      clearSession()
      broadcaster.post(BROADCAST_EVENTS.LOGOUT)
      return result
    })
  }

  /**
   * Detaches cross-tab listeners without tearing the client down. Paired with
   * `connect()` so a React effect can clean up and re-run — the client stays
   * usable in between.
   */
  function disconnect() {
    broadcaster.close()
  }

  /** Re-attaches cross-tab listeners. Idempotent. */
  function connect() {
    broadcaster.open()
  }

  /** Permanent teardown. Only for clients you create and discard dynamically;
   *  an app-lifetime client never needs it. */
  function destroy() {
    broadcaster.destroy()
    listeners.clear()
  }

  return {
    // state
    getState,
    subscribe,
    // session
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
    signOut,
    logout: signOut,
    // tokens
    refreshToken,
    getTokens: () => tokenStore.getTokens(),
    getIdToken: () => tokenStore.getIdToken(),
    getAccessToken: () => tokenStore.getAccessToken(),
    // Not on state by design — see sessionTokens() above.
    getRefreshToken: () => tokenStore.getRefreshToken(),
    getValidToken: () => tokenManager.getValidToken(),
    expiresIn: () => tokenManager.expiresIn(),
    // lifecycle
    connect,
    disconnect,
    destroy,
    // escape hatches
    tokenStore,
    __backend: backend,
  }
}
