/**
 * End-to-end verification of the *built* package, against a real HTTP server.
 *
 * Imports from ./dist — the exact artifact consumers install — rather than
 * ./src, so a broken build, a missing export or a bad `exports` map fails here
 * instead of in someone's app. The server is scripts/test-server.mjs, which is
 * never shipped.
 *
 *   node scripts/verify-package.mjs
 */

import assert from 'node:assert/strict'
import { startTestServer } from './test-server.mjs'

const results = []
let failures = 0

async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    failures++
    results.push({ name, ok: false, error })
  }
}

/** localStorage doesn't exist in Node — the pluggable adapter covers for it. */
function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
  }
}

const {
  createAuthClient,
  createHttpBackend,
  decodeJWT,
  isExpired,
  secondsUntilExpiry,
  normalizeTokens,
  AUTH_ENDPOINTS,
  IDENTIFIER_TYPE,
  OTP_PURPOSE,
  AuthProvider,
  useAuth,
  AuthFlow,
  SignIn,
  Button,
  applyTheme,
  validateIdentifier,
} = await import('../dist/index.js')

const EMAIL = 'verify@example.com'
const PASSWORD = 'Password123!'

let server = await startTestServer()

/** A client pointed at the test server. */
function client(config = {}) {
  return createAuthClient({
    baseURL: server.baseURL,
    crossTab: false,
    storage: memoryStorage(),
    ...config,
  })
}

/**
 * A signed-in client, following the real journey: sign up, confirm the account
 * with the emailed code, then sign in. Confirming does not authenticate.
 */
async function signedIn(config = {}) {
  const storage = config.storage ?? memoryStorage()
  const auth = client({ ...config, storage })
  const email = config.email ?? EMAIL
  await auth.signUp({ email, password: PASSWORD, firstName: 'Ver', lastName: 'Ify' })
  await auth.verifyOtp({ identifier: email, otp: server.OTP })
  await auth.signIn({ email, password: PASSWORD })
  return { auth, storage, email }
}

// ── 1. Package surface ──────────────────────────────────────────────────────

await test('root entry exports core, react and ui from one file', () => {
  for (const [name, value] of Object.entries({
    createAuthClient, createHttpBackend, decodeJWT, normalizeTokens,
    AuthProvider, useAuth, AuthFlow, SignIn, Button, applyTheme, validateIdentifier,
  })) {
    assert.ok(value !== undefined, `${name} is not exported from the root entry`)
  }
  assert.equal(IDENTIFIER_TYPE.EMAIL, 'email')
  assert.equal(OTP_PURPOSE.PASSWORD_RESET, 'password-reset')
})

await test('no mock backend is shipped', async () => {
  const surface = await import('../dist/index.js')
  assert.equal(surface.createMockBackend, undefined, 'createMockBackend is still exported')

  const core = await import('../dist/core/index.js')
  assert.equal(core.createMockBackend, undefined, 'createMockBackend is still on the core subpath')
})

await test('client exposes every documented method', () => {
  const auth = client()
  const required = [
    'signUp', 'signIn', 'login', 'verifyOtp', 'resendOtp',
    'forgotPassword', 'verifyResetOtp', 'resetPassword',
    'changePassword', 'deleteAccount', 'signOut', 'logout',
    'refreshToken', 'getTokens', 'getIdToken',
    'getAccessToken', 'getRefreshToken', 'getValidToken', 'expiresIn',
    'getState', 'subscribe', 'connect', 'disconnect', 'destroy',
  ]
  for (const method of required) {
    assert.equal(typeof auth[method], 'function', `client.${method} is missing`)
  }
  assert.equal(auth.login, auth.signIn, 'login must alias signIn')
  assert.equal(auth.logout, auth.signOut, 'logout must alias signOut')
})

await test('baseURL is required', () => {
  // Without an in-memory fallback, a missing baseURL would silently send every
  // request to the current origin. Fail loudly instead.
  assert.throws(() => createAuthClient({ crossTab: false, storage: memoryStorage() }),
    /requires a baseURL/)
})

await test('endpoints match the backend contract exactly', () => {
  assert.deepEqual(AUTH_ENDPOINTS, {
    SIGN_UP: '/auth/signup',
    SIGN_IN: '/auth/signin',
    VERIFY_OTP: '/auth/verify-otp',
    RESEND_OTP: '/auth/resend-otp',
    FORGOT_PASSWORD: '/auth/forgot-password',
    VERIFY_RESET_OTP: '/auth/verify-reset-otp',
    RESET_PASSWORD: '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
    DELETE_ACCOUNT: '/auth/delete-account',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
  })
})

await test('the http backend posts to the contract routes', async () => {
  const calls = []
  const fake = { post: async (url) => { calls.push(url); return { data: {} } } }
  const backend = createHttpBackend(fake)

  await backend.signIn({})
  await backend.verifyOtp({})
  await backend.refreshToken({})
  await backend.signOut({})

  assert.deepEqual(calls, ['/auth/signin', '/auth/verify-otp', '/auth/refresh', '/auth/logout'])
})

// ── 2. Sign-up -> OTP -> authenticated, over real HTTP ──────────────────────

await test('sign-up issues an OTP challenge without authenticating', async () => {
  const auth = client()
  const result = await auth.signUp({ email: 'fresh@example.com', password: PASSWORD })

  assert.equal(result.error, false, result.message)
  assert.equal(auth.getState().isAuthenticated, false, 'must not authenticate before OTP')
  assert.equal(auth.getIdToken(), null)
})

await test('signIn authenticates directly — no OTP step', async () => {
  const { auth, email } = await signedIn({ email: 'bundle@example.com' })

  const state = auth.getState()
  assert.equal(state.isAuthenticated, true, 'signIn alone should authenticate')
  assert.equal(state.user.email, email)

  const tokens = auth.getTokens()
  // The API returns camelCase idToken/refreshToken; the store normalises them.
  assert.ok(tokens.id_token, 'bundle is missing id_token')
  assert.ok(tokens.refresh_token, 'bundle is missing refresh_token')
  assert.equal(state.idToken, tokens.id_token)

  // The API issues no accessToken, so state exposes null rather than a stale value.
  assert.equal(state.accessToken, null, 'accessToken should be null — the API issues none')
})

await test('verifyOtp confirms a new account without authenticating', async () => {
  const auth = client()
  const email = 'confirmonly@example.com'
  await auth.signUp({ email, password: PASSWORD, firstName: 'C', lastName: 'O' })

  const result = await auth.verifyOtp({ identifier: email, otp: server.OTP })

  assert.equal(result.error, false, result.message)
  assert.equal(auth.getState().isAuthenticated, false,
    'confirming an account must not authenticate — the user signs in next')
  assert.equal(auth.getIdToken(), null)
})

await test('an unconfirmed account cannot sign in', async () => {
  const auth = client()
  const email = 'unconfirmed@example.com'
  await auth.signUp({ email, password: PASSWORD, firstName: 'U', lastName: 'C' })

  const result = await auth.signIn({ email, password: PASSWORD })
  assert.equal(result.error, true)
  assert.equal(result.code, 'USER_NOT_CONFIRMED')
  assert.equal(auth.getState().isAuthenticated, false)
})

await test('the user object is not smuggled into the token bundle', async () => {
  const { auth } = await signedIn({ email: 'nosmuggle@example.com' })

  assert.equal(auth.getTokens().user, undefined,
    'the user must live under its own key, not inside the token blob')
  assert.ok(auth.getState().user.email, 'the user should still be readable')

  await auth.refreshToken()
  assert.equal(auth.getTokens().user, undefined, 'a refresh carried the user forward')
})

await test('issued tokens are real JWTs with live exp claims', async () => {
  const { auth, email } = await signedIn({ email: 'jwt@example.com' })

  const idToken = auth.getIdToken()
  assert.equal(idToken.split('.').length, 3, 'id_token is not a three-part JWT')

  const claims = decodeJWT(idToken)
  assert.equal(claims.email, email)
  assert.ok(claims.sub, 'missing sub claim')

  const ttl = secondsUntilExpiry(idToken)
  assert.ok(ttl > 250 && ttl <= 300, `expected ~300s TTL, got ${ttl}`)
  assert.equal(isExpired(idToken), false)
})

await test('wrong OTP is rejected and does not authenticate', async () => {
  const auth = client()
  await auth.signUp({ email: 'badotp@example.com', password: PASSWORD })

  const result = await auth.verifyOtp({ identifier: 'badotp@example.com', otp: '000000' })
  assert.equal(result.error, true)
  assert.equal(result.code, 'OTP_INVALID')
  assert.equal(result.status, 400)
  assert.equal(auth.getState().isAuthenticated, false)
  assert.equal(auth.getState().error, result.message, 'error must surface on state')
})

await test('wrong password is rejected without revealing the account exists', async () => {
  const auth = client()

  const unknown = await auth.signIn({ email: 'nobody@example.com', password: 'whatever1' })
  const wrongPassword = await auth.signIn({ email: 'seed@example.com', password: 'wrongpassword' })

  assert.equal(unknown.error, true)
  assert.equal(wrongPassword.error, true)
  assert.equal(unknown.message, wrongPassword.message, 'messages must not allow enumeration')
  assert.equal(wrongPassword.status, 401)
})

await test('OTP attempts are limited', async () => {
  const auth = client()
  await auth.signUp({ email: 'lockout@example.com', password: PASSWORD })

  const codes = []
  for (let attempt = 0; attempt < 6; attempt++) {
    codes.push((await auth.verifyOtp({ identifier: 'lockout@example.com', otp: '999999' })).code)
  }
  assert.equal(codes.at(-1), 'OTP_ATTEMPTS_EXCEEDED', `expected lockout, got ${codes.join(', ')}`)
})

// ── 3. Token refresh ────────────────────────────────────────────────────────

await test('refreshToken rotates the whole bundle', async () => {
  const { auth } = await signedIn({ email: 'rotate@example.com' })
  const before = auth.getTokens()

  const result = await auth.refreshToken()
  assert.equal(result.error, false, result.message)

  const after = auth.getTokens()
  assert.notEqual(after.id_token, before.id_token, 'id_token was not renewed')
  assert.notEqual(after.refresh_token, before.refresh_token, 'refresh_token was not rotated')
  assert.equal(auth.getState().idToken, after.id_token, 'state did not follow storage')
})

await test('a rotated refresh token is single-use', async () => {
  const { auth } = await signedIn({ email: 'singleuse@example.com' })
  const stale = auth.getTokens().refresh_token

  await auth.refreshToken()

  const replay = await auth.__backend.refreshToken({ refreshToken: stale })
  assert.equal(replay.error, true, 'the old refresh token must be revoked')
  assert.equal(replay.code, 'REFRESH_TOKEN_INVALID')
})

await test('concurrent refreshes share one round-trip (single-flight lock)', async () => {
  const { auth } = await signedIn({ email: 'lock@example.com' })

  const before = server.counts.refresh
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => auth.refreshToken()))
  const calls = server.counts.refresh - before

  assert.equal(calls, 1, `expected 1 refresh request for 8 concurrent callers, got ${calls}`)
  assert.ok(outcomes.every((r) => !r.error), 'every queued caller should resolve successfully')
  assert.equal(new Set(outcomes.map((r) => r.data.idToken)).size, 1,
    'all callers must receive the same new token')
})

await test('getValidToken refreshes proactively inside the expiry skew', async () => {
  // A 20s server TTL against a 30s skew: the token is "expiring" on arrival.
  const shortLived = await startTestServer({ tokenTTL: 20 })
  try {
    const auth = createAuthClient({
      baseURL: shortLived.baseURL, crossTab: false,
      storage: memoryStorage(), expirySkewSeconds: 30,
    })
    await auth.signUp({ email: 'skew@example.com', password: PASSWORD })
    await auth.verifyOtp({ identifier: 'skew@example.com', otp: shortLived.OTP })
    await auth.signIn({ email: 'skew@example.com', password: PASSWORD })

    const initial = auth.getIdToken()
    assert.ok(isExpired(initial, 30), 'precondition: token should sit inside the skew window')

    const valid = await auth.getValidToken()
    assert.ok(valid, 'getValidToken returned nothing')
    assert.notEqual(valid, initial, 'expected a proactive refresh, got the stale token back')
  } finally {
    await shortLived.close()
  }
})

await test('getValidToken leaves a healthy token alone', async () => {
  const { auth } = await signedIn({ email: 'healthy@example.com', expirySkewSeconds: 30 })
  const initial = auth.getIdToken()
  assert.equal(await auth.getValidToken(), initial, 'must not refresh a token that is still valid')
})

await test('a 401 on a token-only route refreshes once and replays', async () => {
  const { auth } = await signedIn({ email: 'retry@example.com' })
  const beforeToken = auth.getIdToken()

  // logout is Bearer-authenticated and carries no credentials, so a 401 from
  // it can only mean the token was rejected — exactly the clock-skew and
  // server-side-revocation case the retry exists for.
  server.expireNext('/auth/logout')
  const before = server.counts.refresh

  const result = await auth.logout()

  assert.equal(result.error, false, `the retry should have succeeded: ${result.message}`)
  assert.equal(server.counts.refresh - before, 1, 'expected exactly one refresh')
  assert.notEqual(beforeToken, null)
})

await test('a 401 from a password-carrying route does NOT refresh', async () => {
  const { auth } = await signedIn({ email: 'nopointless@example.com' })

  // This API answers 401 for a wrong currentPassword. Refreshing there would
  // spend a round-trip and rotate a good session because of a typo.
  const before = server.counts.refresh
  const result = await auth.changePassword({
    currentPassword: 'definitely-wrong', newPassword: 'Whatever12345!',
  })

  assert.equal(result.error, true)
  assert.equal(server.counts.refresh - before, 0,
    'a wrong password must not trigger a token refresh')
  assert.equal(auth.getState().isAuthenticated, true, 'the session must survive')
  assert.equal(result.code, 'CURRENT_PASSWORD_INVALID', 'the real error should surface')
})

await test('authenticated routes carry a Bearer token; pre-auth routes do not', async () => {
  const { auth } = await signedIn({ email: 'bearer@example.com' })
  await auth.changePassword({ currentPassword: PASSWORD, newPassword: 'BearerPass123!' })

  assert.equal(server.sawBearer('/auth/signup'), false, 'sign-up must not send a Bearer token')
  assert.equal(server.sawBearer('/auth/change-password'), true,
    'change-password must send Authorization: Bearer')
})

await test('a failed refresh with a still-valid token does NOT log the user out', async () => {
  let forced = 0
  const { auth } = await signedIn({ email: 'stillvalid@example.com', onForceLogout: () => { forced++ } })

  // Server-side revocation while the token we hold is still good.
  auth.tokenStore.saveTokens({ refresh_token: 'rt_revoked_by_server' })

  const result = await auth.refreshToken()

  assert.equal(result.error, true, 'the refresh should report failure')
  assert.equal(forced, 0, 'a typo-triggered 401 must not sign the user out')
  assert.equal(auth.getState().isAuthenticated, true, 'the session should survive')
  assert.ok(auth.getIdToken(), 'the still-valid idToken should be kept')
})

await test('a failed refresh with an expired token forces logout', async () => {
  let forced = 0
  const { auth } = await signedIn({ email: 'expired@example.com', onForceLogout: () => { forced++ } })

  // An expired idToken plus an unusable refresh token is an unrecoverable session.
  const past = Math.floor(Date.now() / 1000) - 3600
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  auth.tokenStore.saveTokens({
    id_token: `${b64({ alg: 'none' })}.${b64({ sub: 'x', exp: past })}.unsigned`,
    refresh_token: 'rt_revoked_by_server',
  })

  const result = await auth.refreshToken()
  assert.equal(result.error, true)
  assert.equal(forced, 1, 'onForceLogout should fire exactly once')
  assert.equal(auth.getState().isAuthenticated, false)
  assert.equal(auth.getIdToken(), null, 'session must be cleared')
})

// ── 4. Password + account flows ─────────────────────────────────────────────

await test('forgot -> verify -> reset, then sign in with the new password', async () => {
  const { auth, email } = await signedIn({ email: 'reset@example.com' })
  await auth.logout()

  assert.equal((await auth.forgotPassword({ email })).error, false)

  const verified = await auth.verifyResetOtp({ identifier: email, otp: server.OTP })
  assert.equal(verified.error, false, verified.message)
  assert.ok(verified.data.resetToken, 'no reset token issued')

  const NEW = 'BrandNewPass456!'
  const reset = await auth.resetPassword({ resetToken: verified.data.resetToken, newPassword: NEW })
  assert.equal(reset.error, false, reset.message)

  assert.equal((await auth.signIn({ email, password: PASSWORD })).error, true, 'the old password must stop working')
  assert.equal((await auth.signIn({ email, password: NEW })).error, false, 'the new password should work')
})

await test('a reset token cannot be replayed', async () => {
  const { auth, email } = await signedIn({ email: 'replay@example.com' })
  await auth.logout()
  await auth.forgotPassword({ email })
  const { data } = await auth.verifyResetOtp({ identifier: email, otp: server.OTP })

  await auth.resetPassword({ resetToken: data.resetToken, newPassword: 'FirstReset123!' })
  const replay = await auth.resetPassword({ resetToken: data.resetToken, newPassword: 'SecondReset123!' })

  assert.equal(replay.error, true, 'a spent reset token must be rejected')
  assert.equal(replay.code, 'RESET_TOKEN_INVALID')
})

await test('changePassword validates the current password', async () => {
  const { auth } = await signedIn({ email: 'changepw@example.com' })

  const wrong = await auth.changePassword({ currentPassword: 'notmypassword', newPassword: 'Whatever12345!' })
  assert.equal(wrong.error, true)
  assert.equal(wrong.code, 'CURRENT_PASSWORD_INVALID')
  assert.equal(auth.getState().isAuthenticated, true, 'a failed change must not sign the user out')

  const ok = await auth.changePassword({ currentPassword: PASSWORD, newPassword: 'ChangedPass789!' })
  assert.equal(ok.error, false, ok.message)
})

await test('a failed deleteAccount keeps the session; a successful one clears it', async () => {
  const { auth, storage } = await signedIn({ email: 'delete@example.com' })

  const rejected = await auth.deleteAccount({ password: 'wrongpassword' })
  assert.equal(rejected.error, true)
  assert.equal(auth.getState().isAuthenticated, true, 'a rejected deletion must leave the user signed in')

  const deleted = await auth.deleteAccount({ password: PASSWORD })
  assert.equal(deleted.error, false, deleted.message)
  assert.equal(auth.getState().isAuthenticated, false)
  assert.equal(storage.size(), 0, 'storage should be empty after deletion')
})

await test('logout clears storage and revokes the refresh token server-side', async () => {
  const { auth, storage } = await signedIn({ email: 'logout@example.com' })
  const refreshToken = auth.getTokens().refresh_token

  const result = await auth.logout()
  assert.equal(result.error, false)
  assert.equal(auth.getState().isAuthenticated, false)
  assert.equal(storage.size(), 0, 'logout must clear persisted tokens')

  const reuse = await auth.__backend.refreshToken({ refreshToken })
  assert.equal(reuse.error, true, 'the refresh token should be revoked on logout')
})

await test('clearError() dismisses a surfaced error', async () => {
  const auth = client()

  const failed = await auth.signIn({ email: 'nobody@example.com', password: 'whatever1' })
  assert.equal(failed.error, true)
  assert.equal(auth.getState().error, failed.message, 'the error should be on state')

  auth.clearError()
  assert.equal(auth.getState().error, null, 'clearError() left the error in place')
})

await test('clearError notifies subscribers so the UI re-renders', async () => {
  const auth = client()
  await auth.signIn({ email: 'nobody@example.com', password: 'whatever1' })

  const seen = []
  auth.subscribe((state) => seen.push(state.error))
  auth.clearError()

  assert.deepEqual(seen, [null], 'subscribers must be told, or the banner stays on screen')
})

// ── 5. State, storage and errors ────────────────────────────────────────────

await test('subscribers are notified on state changes', async () => {
  const auth = client()
  const seen = []
  const unsubscribe = auth.subscribe((state) => seen.push(state.isAuthenticated))

  await auth.signUp({ email: 'subs@example.com', password: PASSWORD })
  await auth.verifyOtp({ identifier: 'subs@example.com', otp: server.OTP })
  await auth.signIn({ email: 'subs@example.com', password: PASSWORD })

  assert.ok(seen.length > 0, 'subscriber never fired')
  assert.equal(seen.at(-1), true, 'final state should be authenticated')

  unsubscribe()
  const countAfter = seen.length
  await auth.logout()
  assert.equal(seen.length, countAfter, 'unsubscribe did not detach the listener')
})

await test('a session rehydrates from storage into a fresh client', async () => {
  const { auth, storage } = await signedIn({ email: 'rehydrate@example.com' })
  const idToken = auth.getIdToken()

  // Same storage, brand-new client — as if the page had been reloaded.
  const revived = client({ storage })

  assert.equal(revived.getState().isAuthenticated, true, 'session did not survive a reload')
  assert.equal(revived.getIdToken(), idToken)
  assert.equal(revived.getState().user.email, 'rehydrate@example.com')
})

await test('normalizeTokens accepts snake_case, camelCase and nested shapes', () => {
  const expected = { id_token: 'i', access_token: 'a', refresh_token: 'r' }

  assert.deepEqual(normalizeTokens({ id_token: 'i', access_token: 'a', refresh_token: 'r' }), expected)
  assert.deepEqual(normalizeTokens({ idToken: 'i', accessToken: 'a', refreshToken: 'r' }), expected)
  assert.deepEqual(normalizeTokens({ data: { id_token: 'i', access_token: 'a', refresh_token: 'r' } }), expected)
  assert.equal(normalizeTokens({ id_token: 'i', session_token: 's' }).session_token, 's')
})

await test('a partial refresh response keeps the existing refresh token', async () => {
  const { auth } = await signedIn({ email: 'partial@example.com' })
  const original = auth.getTokens().refresh_token

  auth.tokenStore.saveTokens({ id_token: 'replacement-id-token' })

  assert.equal(auth.getIdToken(), 'replacement-id-token')
  assert.equal(auth.getTokens().refresh_token, original,
    'a partial bundle must not drop the refresh token')
})

await test('an unreachable server yields a network error, not a crash', async () => {
  const offline = createAuthClient({
    baseURL: 'http://127.0.0.1:1', crossTab: false, storage: memoryStorage(),
  })

  const result = await offline.signIn({ email: EMAIL, password: PASSWORD })
  assert.equal(result.error, true)
  assert.equal(result.code, 'NETWORK_ERROR')
  assert.match(result.message, /Could not reach the server/)
})

// ── report ──────────────────────────────────────────────────────────────────

await server.close()

const pad = (n) => String(n).padStart(2, ' ')
results.forEach((result, index) => {
  console.log(`${result.ok ? ' ok ' : 'FAIL'} ${pad(index + 1)}. ${result.name}`)
  if (!result.ok) console.log(`      ${result.error.message.split('\n')[0]}`)
})

console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
