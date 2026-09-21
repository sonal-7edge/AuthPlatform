import { decodeJWT, isExpired, secondsUntilExpiry } from './jwt'
import { BROADCAST_EVENTS, DEFAULT_EXPIRY_SKEW_SECONDS } from './constants'

/**
 * Owns the token lifecycle for one auth client — the library-side counterpart
 * of ORDO's `src/helpers/tokenManager.js`, with the same guarantees:
 *
 *  • getValidToken()  returns a non-expired id_token, refreshing silently when
 *                     it falls inside the skew window (ORDO: 30s).
 *  • refresh()        holds a single-flight lock. Concurrent callers queue and
 *                     all resolve from the one network round-trip, so N parallel
 *                     401s produce exactly one refresh — not N.
 *  • cross-tab        every successful refresh is broadcast so sibling tabs
 *                     adopt the new bundle instead of racing their own refresh.
 *
 * Deliberately transport-agnostic: it is handed a `requestRefresh` function and
 * never imports axios, so it can be driven by any backend or a test double.
 */
export function createTokenManager({
  tokenStore,
  requestRefresh,
  broadcaster,
  onRefreshed,
  onForceLogout,
  expirySkewSeconds = DEFAULT_EXPIRY_SKEW_SECONDS,
}) {
  let isRefreshing = false
  let pendingQueue = []

  function flushQueue(error, token = null) {
    const queue = pendingQueue
    pendingQueue = []
    queue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)))
  }

  /**
   * Renews the bundle using the stored refresh_token.
   *
   * @param {boolean} [bypassExpiryCheck] Skip the "is it still valid?" guard.
   *   The 401 interceptor sets this: the server has already rejected the token,
   *   so a local `exp` that still looks fresh (clock skew, server-side
   *   revocation) must not short-circuit the refresh.
   * @returns {Promise<string>} the new id_token
   * @throws when no refresh token exists or the refresh call fails — callers
   *   should treat a throw as a logout signal.
   */
  async function refresh(bypassExpiryCheck = false) {
    // Someone is already refreshing — queue behind them rather than duplicating.
    if (isRefreshing) {
      return new Promise((resolve, reject) => pendingQueue.push({ resolve, reject }))
    }

    isRefreshing = true

    try {
      const refreshToken = tokenStore.getRefreshToken()
      if (!refreshToken) throw new Error('No refresh token available')

      // Another tab may have refreshed while we waited — re-read and reuse.
      const currentIdToken = tokenStore.getIdToken()
      if (!bypassExpiryCheck && currentIdToken && !isExpired(currentIdToken, expirySkewSeconds)) {
        isRefreshing = false
        flushQueue(null, currentIdToken)
        return currentIdToken
      }

      /**
       * Cognito needs a SECRET_HASH when the app client has a client secret,
       * and that hash is an HMAC over the *username* — which the backend
       * cannot recover from the refresh token alone (it is opaque to it).
       * So we hand it over, read from the id_token we already hold.
       *
       * `cognito:username` is not `sub`: on a pool with an alias attribute
       * they are different values, and only the former hashes correctly.
       *
       * Read from the expired token deliberately — this runs precisely when
       * the id_token has aged out, and `exp` does not affect the claim.
       * Sending it is not a trust decision: Cognito checks the hash against
       * the user that actually owns the refresh token, so a wrong username
       * fails the call rather than redirecting it at someone else's session.
       */
      const username = decodeJWT(currentIdToken)?.['cognito:username']

      const result = await requestRefresh({
        refreshToken,
        refresh_token: refreshToken,
        ...(username ? { username } : {}),
      })
      if (result.error) throw new Error(result.message || 'Token refresh failed')

      // Accept either a bare bundle or one nested under `tokens` (ORDO's shape).
      const saved = tokenStore.saveTokens(result.data?.tokens ?? result.data)
      const newIdToken = saved?.id_token
      if (!newIdToken) throw new Error('Refresh response contained no id_token')

      broadcaster?.post(BROADCAST_EVENTS.TOKEN_REFRESHED, { tokens: saved })
      onRefreshed?.(saved)

      isRefreshing = false
      flushQueue(null, newIdToken)
      return newIdToken
    } catch (error) {
      isRefreshing = false
      flushQueue(error)

      /**
       * A failed refresh only means the session is dead if the token we hold
       * is genuinely expired.
       *
       * Real APIs overload 401: some answer it for a wrong `currentPassword`
       * on an authenticated route. The 401 interceptor then refreshes, and if
       * that refresh is itself failing the user would be logged out by a typo.
       * Checking expiry first keeps a still-valid session alive and lets the
       * original error surface instead.
       */
      if (isExpired(tokenStore.getIdToken(), 0)) {
        // Unrecoverable — tell every tab, not just this one.
        broadcaster?.post(BROADCAST_EVENTS.LOGOUT)
        onForceLogout?.()
      }
      throw error
    }
  }

  return {
    /**
     * A usable id_token, refreshing first if it is expired or about to be.
     * Returns null when there is no session at all (nothing to refresh).
     */
    async getValidToken() {
      const idToken = tokenStore.getIdToken()
      if (!idToken) return null
      if (!isExpired(idToken, expirySkewSeconds)) return idToken

      try {
        return await refresh(true)
      } catch {
        // Refresh already broadcast the logout; let the request go out bare and
        // fail with a real 401 rather than throwing from the request pipeline.
        return null
      }
    },

    refresh,

    /** Seconds until the stored id_token expires (Infinity if no `exp`). */
    expiresIn() {
      const idToken = tokenStore.getIdToken()
      return idToken ? secondsUntilExpiry(idToken) : 0
    },

    get isRefreshing() {
      return isRefreshing
    },
  }
}
