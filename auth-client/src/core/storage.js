import { DEFAULT_STORAGE_KEYS } from './constants'

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  }
}

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return createMemoryStorage()
}

/**
 * Creates a token store backed by a pluggable storage adapter (defaults to
 * localStorage in the browser, falling back to an in-memory store for SSR).
 * @param {{ storage?: { getItem, setItem, removeItem }, keys?: Partial<typeof DEFAULT_STORAGE_KEYS> }} [options]
 */
export function createTokenStore({ storage, keys } = {}) {
  const KEYS = { ...DEFAULT_STORAGE_KEYS, ...keys }
  const backend = resolveStorage(storage)

  return {
    saveTokens({ idToken, refreshToken }) {
      if (idToken !== undefined) backend.setItem(KEYS.ID_TOKEN, idToken)
      if (refreshToken !== undefined) backend.setItem(KEYS.REFRESH_TOKEN, refreshToken)
    },

    getIdToken() {
      return backend.getItem(KEYS.ID_TOKEN)
    },

    getRefreshToken() {
      return backend.getItem(KEYS.REFRESH_TOKEN)
    },

    getTokens() {
      return {
        idToken: backend.getItem(KEYS.ID_TOKEN),
        refreshToken: backend.getItem(KEYS.REFRESH_TOKEN),
      }
    },

    saveUser(user) {
      backend.setItem(KEYS.USER, JSON.stringify(user))
    },

    getUser() {
      try {
        const raw = backend.getItem(KEYS.USER)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },

    clear() {
      Object.values(KEYS).forEach((key) => backend.removeItem(key))
    },

    isAuthenticated() {
      return !!backend.getItem(KEYS.ID_TOKEN)
    },
  }
}
