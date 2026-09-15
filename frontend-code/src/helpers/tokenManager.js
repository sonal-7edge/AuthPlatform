import { TOKEN_KEYS } from '../constants/authConstants'

export const tokenManager = {
  saveTokens({ idToken, refreshToken }) {
    localStorage.setItem(TOKEN_KEYS.ID_TOKEN, idToken)
    localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, refreshToken)
  },

  getIdToken() {
    return localStorage.getItem(TOKEN_KEYS.ID_TOKEN)
  },

  getRefreshToken() {
    return localStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN)
  },

  getTokens() {
    return {
      idToken: localStorage.getItem(TOKEN_KEYS.ID_TOKEN),
      refreshToken: localStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN),
    }
  },

  saveUser(user) {
    localStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(user))
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEYS.USER))
    } catch {
      return null
    }
  },

  clear() {
    Object.values(TOKEN_KEYS).forEach((key) => localStorage.removeItem(key))
  },

  isAuthenticated() {
    return !!localStorage.getItem(TOKEN_KEYS.ID_TOKEN)
  },
}
