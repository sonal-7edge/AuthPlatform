import axios from 'axios'
import { AUTH_ENDPOINTS } from './constants'

/**
 * Routes that authenticate the user again inside the request body, so a 401
 * from them may mean "wrong password" rather than "bad token".
 */
function carriesCredentials(url, routes) {
  return [routes.CHANGE_PASSWORD, routes.DELETE_ACCOUNT].some((route) => url.includes(route))
}

/** Requests that must never trigger a refresh before they are sent. */
function skipsAuthRefresh(url = '') {
  // Refreshing before the refresh call itself would recurse forever.
  if (url.includes(AUTH_ENDPOINTS.REFRESH)) return true
  // S3 pre-signed URLs already carry AWS auth in the query string; adding an
  // Authorization header makes AWS reject with "Only one auth mechanism allowed".
  if (url.includes('X-Amz-Signature') || url.includes('X-Amz-Algorithm')) return true
  return false
}

/**
 * A dedicated axios instance (never the global `axios` object) so multiple
 * clients can coexist without stepping on each other's interceptors.
 *
 * Request:  proactively swaps in a fresh id_token when the current one is
 *           inside the expiry skew window — the request goes out valid rather
 *           than 401-ing and being retried.
 * Response: on a 401 that slipped through anyway (revoked server-side, clock
 *           skew), refreshes once and replays the original request. The
 *           single-flight lock lives in tokenManager, so concurrent 401s share
 *           one refresh.
 */
export function createHttpClient({ baseURL, tokenStore, tokenManager, headers, endpoints }) {
  const routes = { ...AUTH_ENDPOINTS, ...endpoints }
  const instance = axios.create({ baseURL, headers })

  instance.interceptors.request.use(async (config) => {
    if (skipsAuthRefresh(config.url ?? '')) return config

    // Falls back to whatever is stored if the refresh fails — the response
    // interceptor is the safety net.
    const token = (await tokenManager.getValidToken()) ?? tokenStore.getIdToken()
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config
      const is401 = error.response?.status === 401
      const isRetry = originalRequest?._retry === true
      const isRefreshCall = skipsAuthRefresh(originalRequest?.url ?? '')

      if (!originalRequest || !is401 || isRetry || isRefreshCall) {
        return Promise.reject(error)
      }

      /**
       * A 401 from a route that takes a password in its body is ambiguous:
       * this API returns it for a wrong `currentPassword` and a wrong
       * delete-account `password`, not just for a bad token. Refreshing there
       * spends a needless round-trip and rotates a perfectly good session
       * because someone mistyped — so surface the original error instead.
       *
       * Every other authenticated route only 401s about the token, and those
       * still refresh and replay: that is what covers clock skew and
       * server-side revocation, where the token looks fine locally.
       */
      if (carriesCredentials(originalRequest.url ?? '', routes)) {
        return Promise.reject(error)
      }

      originalRequest._retry = true

      try {
        // bypass=true: the server rejected this token, so a locally-valid `exp`
        // must not talk us out of refreshing.
        const newToken = await tokenManager.refresh(true)
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return instance(originalRequest)
      } catch {
        // tokenManager owns the force-logout decision: it only tears the
        // session down when the stored token is actually expired.
        return Promise.reject(error)
      }
    }
  )

  return instance
}
