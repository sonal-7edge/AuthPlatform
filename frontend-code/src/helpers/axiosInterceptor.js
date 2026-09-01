import axios from 'axios'
import { tokenManager } from './tokenManager'
import { AuthService } from '../services/Auth.Service'

let isRefreshing = false
let pendingQueue = []

function processQueue(error, token = null) {
  pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)))
  pendingQueue = []
}

/**
 * Sets up global axios request/response interceptors.
 * - Request: injects Authorization header from localStorage
 * - Response: on 401, attempts one silent token refresh; retries original request
 * Call once at app startup (routes/index.jsx).
 */
export function setupAxiosInterceptors(onForceLogout) {
  // Request — inject current idToken
  axios.interceptors.request.use((config) => {
    const idToken = tokenManager.getIdToken()
    if (idToken) config.headers.Authorization = `Bearer ${idToken}`
    return config
  })

  // Response — handle expired tokens
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config

      if (error.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) =>
          pendingQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(axios(originalRequest))
            },
            reject,
          })
        )
      }

      originalRequest._retry = true
      isRefreshing = true

      const result = await AuthService.RefreshToken({
        refreshToken: tokenManager.getRefreshToken(),
      })

      if (result.error) {
        processQueue(new Error(result.message))
        isRefreshing = false
        tokenManager.clear()
        onForceLogout?.()
        return Promise.reject(error)
      }

      tokenManager.saveTokens(result.data)
      processQueue(null, result.data.idToken)
      isRefreshing = false

      originalRequest.headers.Authorization = `Bearer ${result.data.idToken}`
      return axios(originalRequest)
    }
  )
}
