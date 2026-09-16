/**
 * The default configuration, so a consuming project does not need a config
 * file of its own. Set VITE_API_BASE_URL in .env and import `authConfig`.
 *
 * This file is NOT bundled. It is copied into dist/ as-is, because Vite
 * substitutes `import.meta.env.VITE_*` at build time — including our own
 * build, which would bake in an empty string and hand every consumer a
 * useless constant. Shipped as plain source, the substitution happens in the
 * consumer's build instead, where the value actually lives.
 *
 * Nothing here throws at import time: the package must be importable for its
 * components alone. A missing or placeholder URL is reported by
 * createAuthClient, when a client is actually built.
 */

// Imported from the built entry point, not from source: this file is copied
// into dist/ verbatim rather than bundled, so './index.js' resolves to
// dist/index.js at runtime — and resolves to src/index.js during development.
import { createAuthClient, DEFAULT_EXPIRY_SKEW_SECONDS } from './index.js'

/**
 * Other frameworks expose env differently — pass `baseURL` explicitly instead:
 *   Create React App   process.env.REACT_APP_API_BASE_URL
 *   Next.js            process.env.NEXT_PUBLIC_API_BASE_URL
 */
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? ''

export const authConfig = {
  baseURL: API_BASE_URL,
  expirySkewSeconds: DEFAULT_EXPIRY_SKEW_SECONDS,
  crossTab: true,
}

let singleton

/**
 * One client for the whole app, created on first use. For non-React code —
 * an API layer that needs `getValidToken()`, say. React components should use
 * `useAuth()`, which reads the client the provider already made.
 */
export function getAuthClient(overrides) {
  singleton ??= createAuthClient({ ...authConfig, ...overrides })
  return singleton
}
