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
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      // Private-mode Safari exposes localStorage but throws on write.
      const probe = '__auth_client_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return window.localStorage
    } catch {
      return createMemoryStorage()
    }
  }
  return createMemoryStorage()
}

/**
 * Accepts a token bundle in any shape the platform might hand back and
 * returns the canonical snake_case blob we persist.
 *
 * Tolerated inputs, in priority order:
 *   { id_token, access_token, refresh_token, session_token }  — real API / ORDO
 *   { data: { id_token, ... } }                               — ORDO's nested variant
 *   { idToken, accessToken, refreshToken }                    — camelCase callers
 *
 * Unknown fields are preserved untouched, so a platform that adds claims to the
 * bundle (e.g. `session_token`) keeps them across a refresh without a code change.
 */
export function normalizeTokens(input) {
  if (!input || typeof input !== 'object') return null
  const source = input.data && typeof input.data === 'object' ? { ...input.data, ...input } : input

  const {
    id_token, idToken,
    access_token, accessToken,
    refresh_token, refreshToken,
    data: _nested,
    ...rest
  } = source

  const normalized = { ...rest }
  const id = id_token ?? idToken
  const access = access_token ?? accessToken
  const refresh = refresh_token ?? refreshToken

  if (id !== undefined) normalized.id_token = id
  if (access !== undefined) normalized.access_token = access
  if (refresh !== undefined) normalized.refresh_token = refresh

  return normalized
}

/** Canonical blob -> the camelCase shape exposed on client state. */
export function toPublicTokens(tokens) {
  if (!tokens) return { idToken: null, accessToken: null, refreshToken: null }
  return {
    idToken: tokens.id_token ?? null,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
  }
}

/**
 * Token store backed by a pluggable storage adapter (localStorage by default,
 * falling back to memory for SSR and blocked-storage browsers).
 *
 * Tokens are held as one JSON blob so a refresh replaces them atomically —
 * there is no window where a new id_token sits next to a stale refresh_token.
 *
 * @param {{ storage?: { getItem, setItem, removeItem }, keys?: Partial<typeof DEFAULT_STORAGE_KEYS> }} [options]
 */
export function createTokenStore({ storage, keys } = {}) {
  const KEYS = { ...DEFAULT_STORAGE_KEYS, ...keys }
  const backend = resolveStorage(storage)

  function readJSON(key) {
    try {
      const raw = backend.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function writeJSON(key, value) {
    try {
      backend.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded or storage blocked — the in-memory client state still
      // works for this tab; persistence is what degrades.
    }
  }

  return {
    /** Replaces the whole bundle. Merges so a partial refresh response
     *  (id_token only, no new refresh_token) doesn't drop the refresh token. */
    saveTokens(input) {
      const incoming = normalizeTokens(input)
      if (!incoming) return null
      const merged = { ...(readJSON(KEYS.TOKENS) || {}), ...incoming }
      writeJSON(KEYS.TOKENS, merged)
      return merged
    },

    getTokens() {
      return readJSON(KEYS.TOKENS)
    },

    getIdToken() {
      return readJSON(KEYS.TOKENS)?.id_token ?? null
    },

    getAccessToken() {
      return readJSON(KEYS.TOKENS)?.access_token ?? null
    },

    getRefreshToken() {
      return readJSON(KEYS.TOKENS)?.refresh_token ?? null
    },

    saveUser(user) {
      writeJSON(KEYS.USER, user)
    },

    getUser() {
      return readJSON(KEYS.USER)
    },

    clear() {
      Object.values(KEYS).forEach((key) => {
        try {
          backend.removeItem(key)
        } catch {
          // Nothing actionable — the session is being torn down anyway.
        }
      })
    },

    isAuthenticated() {
      return !!readJSON(KEYS.TOKENS)?.id_token
    },
  }
}
