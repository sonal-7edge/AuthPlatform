/**
 * Minimal JWT helpers. We only ever read the payload to check `exp` — the
 * signature is verified server-side, never here. Mirrors the decode logic in
 * the ORDO host app (`src/helpers/auth-header.js`) so both agree on claims.
 */

/** Base64URL -> JSON, tolerant of missing padding and unicode payloads. */
function decodeSegment(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')

  // `atob` in browsers; Buffer only when running under Node (SSR, tests).
  const binary = typeof atob === 'function'
    ? atob(padded)
    : globalThis.Buffer.from(padded, 'base64').toString('binary')

  // Walk the bytes so multi-byte UTF-8 claims (names, emails) survive the trip.
  const percentEncoded = Array.from(binary, (char) =>
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ).join('')

  return JSON.parse(decodeURIComponent(percentEncoded))
}

/**
 * Decodes a JWT's payload. Returns null rather than throwing — callers treat
 * an undecodable token the same as an expired one.
 * @param {string} token
 * @returns {object | null}
 */
export function decodeJWT(token) {
  try {
    const [, payload] = String(token).split('.')
    if (!payload) return null
    return decodeSegment(payload)
  } catch {
    return null
  }
}

/**
 * Seconds until the token expires. Negative once expired, Infinity when the
 * token carries no `exp` claim (nothing to act on).
 * @param {string} token
 */
export function secondsUntilExpiry(token) {
  const exp = decodeJWT(token)?.exp
  if (typeof exp !== 'number') return Infinity
  return exp - Math.floor(Date.now() / 1000)
}

/**
 * True when the token is expired or falls inside the refresh skew window.
 * ORDO uses a 30s skew; we default to the same and let config override it.
 * @param {string} token
 * @param {number} [skewSeconds]
 */
export function isExpired(token, skewSeconds = 30) {
  if (!token) return true
  return secondsUntilExpiry(token) <= skewSeconds
}
