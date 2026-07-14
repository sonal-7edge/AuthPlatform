import axios from 'axios'

/**
 * Creates a dedicated axios instance (not the global `axios` object) so
 * multiple clients/apps can coexist without stepping on each other's
 * interceptors.
 * - Request: injects the current idToken as a Bearer header.
 * - Response: on 401, performs a single silent token refresh via
 *   `onRefreshToken`, queues concurrent requests behind it, and retries.
 */
export function createHttpClient({ baseURL, tokenStore, onRefreshToken, onForceLogout }) {
  const instance = axios.create({ baseURL })

  let isRefreshing = false
  let pendingQueue = []

  function processQueue(error, token = null) {
    pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)))
    pendingQueue = []
  }

  instance.interceptors.request.use((config) => {
    const idToken = tokenStore.getIdToken()
    if (idToken) config.headers.Authorization = `Bearer ${idToken}`
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config

      if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) =>
          pendingQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(instance(originalRequest))
            },
            reject,
          })
        )
      }

      originalRequest._retry = true
      isRefreshing = true

      const result = await onRefreshToken()

      if (result.error) {
        processQueue(new Error(result.message))
        isRefreshing = false
        onForceLogout?.()
        return Promise.reject(error)
      }

      processQueue(null, result.data.idToken)
      isRefreshing = false

      originalRequest.headers.Authorization = `Bearer ${result.data.idToken}`
      return instance(originalRequest)
    }
  )

  return instance
}
