/**
 * Headless subpath — `auth-client/core`.
 *
 * Identical to the core half of the root entry, but with no React import
 * anywhere in the graph. Use this from Node scripts, service workers, or a
 * non-React host; use the root entry (`auth-client`) everywhere else.
 */
export { createAuthClient } from './createAuthClient'
export { createTokenStore, normalizeTokens, toPublicTokens } from './storage'
export { createTokenManager } from './tokenManager'
export { createHttpClient } from './httpClient'
export { createBroadcaster } from './broadcast'
export { createHttpBackend } from './backends/httpBackend'
export { handleErrorResponse } from './handleErrorResponse'
export { decodeJWT, isExpired, secondsUntilExpiry } from './jwt'
export {
  AUTH_ENDPOINTS,
  DEFAULT_STORAGE_KEYS,
  IDENTIFIER_TYPE,
  OTP_PURPOSE,
  OTP_LENGTH,
  AUTH_CHANNEL,
  BROADCAST_EVENTS,
  BROADCAST_FALLBACK_KEYS,
  DEFAULT_EXPIRY_SKEW_SECONDS,
} from './constants'
