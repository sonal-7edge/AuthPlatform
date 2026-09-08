/**
 * A real HTTP auth server, for tests only. Never shipped — it lives in
 * scripts/, outside the `files` allowlist.
 *
 * This replaced the in-library mock backend. Pointing the tests at an actual
 * server is strictly better coverage: it exercises axios, both interceptors,
 * the Bearer header and genuine 401 responses, none of which an in-process
 * fake could reach.
 *
 * It implements the platform contract and enforces the same rules a real
 * service would: OTP expiry and attempt limits, single-use reset tokens,
 * refresh-token rotation, and session revocation.
 */

import { createServer } from 'node:http'

const OTP = '123456'
const TOKEN_TTL = 300
const REFRESH_TTL = 60 * 60 * 24 * 30

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

let seq = 0
const uid = (prefix) => `${prefix}_${(seq++).toString(36)}${Math.floor(Date.now() % 1e6).toString(36)}`

/**
 * Structurally valid, deliberately unsigned. `jti` matters: `iat`/`exp` have
 * only second granularity, so without it two tokens minted in the same second
 * would be byte-identical and a rotation would look like a no-op.
 */
function issueJWT(claims, ttl) {
  const now = Math.floor(Date.now() / 1000)
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({ iat: now, exp: now + ttl, iss: 'auth-client-test', jti: uid('jti'), ...claims }),
    'unsigned',
  ].join('.')
}

/**
 * @param {{ tokenTTL?: number }} [options]
 */
export async function startTestServer({ tokenTTL = TOKEN_TTL } = {}) {
  /** @type {Map<string, object>} identifier -> user */
  const users = new Map()
  /** @type {Map<string, object>} refresh_token -> session */
  const sessions = new Map()
  /** @type {Map<string, object>} identifier -> pending OTP challenge */
  const challenges = new Map()
  /** @type {Map<string, object>} reset token -> grant */
  const resets = new Map()

  const counts = { refresh: 0, total: 0 }
  const seenAuthHeader = new Map()
  /** Makes the next authenticated call 401 once, to drive the retry path. */
  let force401 = null

  const key = (v) => String(v ?? '').trim().toLowerCase()
  const identifierOf = (p = {}) => p.identifier ?? p.email ?? p.phone ?? ''

  function index(user) {
    if (user.email) users.set(key(user.email), user)
    if (user.phone) users.set(key(user.phone), user)
  }

  index({
    id: uid('usr'), email: 'seed@example.com', phone: '+11234567890',
    password: 'Password123!', name: 'Seed User', verified: true,
  })

  function issueBundle(user) {
    const refresh_token = uid('rt')
    sessions.set(refresh_token, {
      userId: user.id,
      identifier: key(user.email ?? user.phone),
      expiresAt: Date.now() + REFRESH_TTL * 1000,
    })
    const claims = { sub: user.id, email: user.email ?? null, name: user.name }
    return {
      id_token: issueJWT(claims, tokenTTL),
      access_token: issueJWT({ ...claims, scope: 'openid profile email' }, tokenTTL),
      refresh_token,
      session_token: issueJWT({ sub: user.id, privileges: ['read', 'write'] }, REFRESH_TTL),
      token_type: 'Bearer',
      expires_in: tokenTTL,
    }
  }

  function challenge(identifier, purpose) {
    challenges.set(key(identifier), {
      purpose, otp: OTP, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000,
    })
  }

  /** Verifies and burns an OTP. Returns an error tuple or null. */
  function consume(payload, purpose) {
    const id = key(identifierOf(payload))
    const c = challenges.get(id)

    if (!c || c.purpose !== purpose) {
      return [400, { message: 'No verification is pending for this account.', code: 'NO_CHALLENGE' }]
    }
    if (Date.now() > c.expiresAt) {
      challenges.delete(id)
      return [410, { message: 'This code has expired.', code: 'OTP_EXPIRED' }]
    }
    if (c.attempts >= 5) {
      challenges.delete(id)
      return [429, { message: 'Too many incorrect attempts.', code: 'OTP_ATTEMPTS_EXCEEDED' }]
    }
    if (String(payload.otp) !== c.otp) {
      c.attempts += 1
      const left = 5 - c.attempts
      return [400, { message: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`, code: 'OTP_INVALID' }]
    }
    challenges.delete(id)
    return null
  }

  function route(url, payload, headers) {
    const bearer = (headers.authorization ?? '').replace(/^Bearer /, '') || null
    seenAuthHeader.set(url, !!bearer)

    // Drive the 401-refresh-retry path deterministically.
    if (force401 === url) {
      force401 = null
      return [401, { message: 'Token rejected', code: 'TOKEN_REJECTED' }]
    }

    const authed = () => {
      // The id_token carries `sub`; look the user up from it rather than the body.
      if (!bearer) return null
      try {
        const { sub } = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString())
        return [...new Set(users.values())].find((u) => u.id === sub) ?? null
      } catch {
        return null
      }
    }

    switch (url) {
      case '/auth/signup': {
        const id = identifierOf(payload)
        if (!id) return [422, { message: 'An email or phone number is required', code: 'IDENTIFIER_REQUIRED' }]
        if (!payload.password || payload.password.length < 8) {
          return [422, { message: 'Password must be at least 8 characters', code: 'PASSWORD_TOO_SHORT' }]
        }
        if (users.has(key(id))) return [409, { message: 'An account already exists', code: 'ACCOUNT_EXISTS' }]

        const isEmail = !!payload.email
        index({
          id: uid('usr'),
          name: [payload.firstName, payload.lastName].filter(Boolean).join(' ') || id,
          email: isEmail ? id : null,
          phone: isEmail ? null : id,
          password: payload.password,
          verified: false,
        })
        challenge(id, 'auth')
        return [200, { message: 'Verification code sent', identifier: id }]
      }

      case '/auth/signin': {
        const user = users.get(key(identifierOf(payload)))
        // Same message either way — no account enumeration.
        if (!user || user.password !== payload.password) {
          return [401, { message: 'Incorrect email/phone or password', code: 'INVALID_CREDENTIALS' }]
        }
        challenge(identifierOf(payload), 'auth')
        return [200, { message: 'Verification code sent' }]
      }

      case '/auth/verify-otp': {
        const failure = consume(payload, 'auth')
        if (failure) return failure
        const user = users.get(key(identifierOf(payload)))
        if (!user) return [404, { message: 'Account not found', code: 'USER_NOT_FOUND' }]
        user.verified = true
        const { password: _p, ...safe } = user
        return [200, { ...issueBundle(user), user: safe }]
      }

      case '/auth/resend-otp': {
        const id = identifierOf(payload)
        if (!users.has(key(id))) return [404, { message: 'Account not found', code: 'USER_NOT_FOUND' }]
        challenge(id, payload.purpose ?? 'auth')
        return [200, { message: 'A new code has been sent' }]
      }

      case '/auth/forgot-password': {
        const id = identifierOf(payload)
        if (users.has(key(id))) challenge(id, 'password-reset')
        // Always reports success — otherwise it leaks which accounts exist.
        return [200, { message: `If an account exists for ${id}, a reset code has been sent.` }]
      }

      case '/auth/verify-reset-otp': {
        const failure = consume(payload, 'password-reset')
        if (failure) return failure
        const resetToken = uid('rst')
        resets.set(resetToken, { identifier: key(identifierOf(payload)), expiresAt: Date.now() + 6e5 })
        return [200, { resetToken, expiresIn: 600 }]
      }

      case '/auth/reset-password': {
        const grant = resets.get(payload.resetToken)
        if (!grant) return [401, { message: 'This reset link is invalid.', code: 'RESET_TOKEN_INVALID' }]
        const next = payload.newPassword ?? payload.password
        if (!next || next.length < 8) {
          return [422, { message: 'Password must be at least 8 characters', code: 'PASSWORD_TOO_SHORT' }]
        }
        const user = users.get(grant.identifier)
        if (!user) return [404, { message: 'Account not found', code: 'USER_NOT_FOUND' }]

        user.password = next
        resets.delete(payload.resetToken)
        // A password change invalidates every existing session.
        sessions.forEach((s, t) => { if (s.userId === user.id) sessions.delete(t) })
        return [200, { message: 'Password reset successfully' }]
      }

      case '/auth/change-password': {
        const user = authed()
        if (!user) return [401, { message: 'You must be signed in', code: 'UNAUTHENTICATED' }]
        if (user.password !== payload.currentPassword) {
          return [400, { message: 'Current password is incorrect', code: 'CURRENT_PASSWORD_INVALID' }]
        }
        if (!payload.newPassword || payload.newPassword.length < 8) {
          return [422, { message: 'New password must be at least 8 characters', code: 'PASSWORD_TOO_SHORT' }]
        }
        user.password = payload.newPassword
        return [200, { message: 'Password changed successfully' }]
      }

      case '/auth/delete-account': {
        const user = authed()
        if (!user) return [401, { message: 'You must be signed in', code: 'UNAUTHENTICATED' }]
        if (user.password !== payload.password) {
          return [400, { message: 'Incorrect password', code: 'PASSWORD_INVALID' }]
        }
        if (user.email) users.delete(key(user.email))
        if (user.phone) users.delete(key(user.phone))
        sessions.forEach((s, t) => { if (s.userId === user.id) sessions.delete(t) })
        return [200, { message: 'Account deleted successfully' }]
      }

      case '/auth/tokens': {
        const user = authed()
        if (!user) return [401, { message: 'You must be signed in', code: 'UNAUTHENTICATED' }]
        return [200, { tokens: issueBundle(user) }]
      }

      case '/auth/refresh': {
        counts.refresh++
        const presented = payload.refreshToken ?? payload.refresh_token
        const session = sessions.get(presented)
        if (!session) return [401, { message: 'Refresh token is invalid or revoked', code: 'REFRESH_TOKEN_INVALID' }]
        if (Date.now() > session.expiresAt) {
          sessions.delete(presented)
          return [401, { message: 'Session has expired', code: 'REFRESH_TOKEN_EXPIRED' }]
        }
        const user = users.get(session.identifier)
        if (!user) {
          sessions.delete(presented)
          return [401, { message: 'Account no longer exists', code: 'USER_NOT_FOUND' }]
        }
        // Rotate: the presented token is single-use.
        sessions.delete(presented)
        return [200, { tokens: issueBundle(user) }]
      }

      case '/auth/logout': {
        const presented = payload?.refreshToken ?? payload?.refresh_token
        if (presented) sessions.delete(presented)
        return [200, { message: 'Signed out' }]
      }

      default:
        return [404, { message: `No route ${url}`, code: 'NOT_FOUND' }]
    }
  }

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      counts.total++
      let payload = {}
      try { payload = body ? JSON.parse(body) : {} } catch { /* treat as empty */ }

      const [status, data] = route(req.url, payload, req.headers)
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  return {
    baseURL: `http://127.0.0.1:${port}`,
    OTP,
    counts,
    /** Did the given route receive an Authorization header? */
    sawBearer: (url) => seenAuthHeader.get(url),
    /** Make the next call to `url` fail with 401 exactly once. */
    expireNext: (url) => { force401 = url },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
