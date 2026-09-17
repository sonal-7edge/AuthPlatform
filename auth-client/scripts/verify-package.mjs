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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/**
 * Source with comments removed.
 *
 * These files explain their own terminal handling at length, and asserting
 * "the code does not do X" against prose that *describes* X gives false
 * failures. Match against code only.
 */
function codeOf(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
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

/** Reads a JWT payload. The test server's tokens are unsigned by design. */
function decodeClaims(token) {
  return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString())
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
    /VITE_API_BASE_URL|pass it directly/)
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

await test('refresh carries cognito:username, so a client-secret pool accepts it', async () => {
  /**
   * Regression: /auth/refresh used to send the refresh token alone. Cognito
   * needs a SECRET_HASH when the app client has a client secret, that hash is
   * an HMAC over the username, and a refresh token is opaque to the backend —
   * so the call came back 401 "Incorrect credentials" against a real pool
   * while every other flow worked. This server rejects a refresh whose
   * username is missing or wrong, the way Cognito does.
   */
  const secretPool = await startTestServer({ requireUsername: true })
  try {
    const auth = client({ baseURL: secretPool.baseURL })
    const email = 'secrethash@example.com'
    await auth.signUp({ email, password: PASSWORD, firstName: 'Se', lastName: 'Cret' })
    await auth.verifyOtp({ identifier: email, otp: secretPool.OTP })
    await auth.signIn({ email, password: PASSWORD })

    const claims = decodeClaims(auth.getTokens().id_token)

    const result = await auth.refreshToken()
    assert.equal(result.error, false, `refresh was rejected: ${result.message}`)

    const sent = secretPool.lastRefreshBody()
    assert.equal(sent.username, claims['cognito:username'],
      'refresh must send the cognito:username claim')
    assert.notEqual(sent.username, claims.sub,
      'sub is not the username — hashing it would 401 against a real pool')
  } finally {
    await secretPool.close()
  }
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

// ── the install / setup contract ────────────────────────────────────────────
// These guard the promise the README makes: `npm install` creates src/auth/
// and touches nothing else; every other change is opt-in and reversible.

const scaffold = await import('../dist/bin/scaffold.mjs')

/** A throwaway project that looks enough like a Vite starter. */
function fakeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'ac-verify-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'main.jsx'), 'ORIGINAL MAIN\n')
  writeFileSync(join(dir, 'src', 'App.jsx'), 'ORIGINAL APP\n')
  writeFileSync(join(dir, 'package.json'), '{"name":"fake"}\n')
  return dir
}
const listing = (dir) => readdirSync(dir, { recursive: true }).sort()
const temps = []
const project = () => { const d = fakeProject(); temps.push(d); return d }

await test('install scaffolds src/auth and touches nothing else', () => {
  const dir = project()
  const before = listing(dir)
  scaffold.scaffoldAuth({ project: dir })
  const added = listing(dir).filter((f) => !before.includes(f))
  assert.ok(added.length > 5, 'expected src/auth to be populated')
  assert.ok(
    added.every((f) => f.startsWith('src/auth')),
    `install wrote outside src/auth: ${added.filter((f) => !f.startsWith('src/auth')).join(', ')}`
  )
  assert.equal(readFileSync(join(dir, 'src', 'App.jsx'), 'utf8'), 'ORIGINAL APP\n')
  assert.equal(existsSync(join(dir, '.env')), false, 'install must not create .env')
})

await test('a second install leaves edited screens alone', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  const screen = join(dir, 'src/auth/screens/SignIn.jsx')
  writeFileSync(screen, '// my edits\n')
  const { created, skipped } = scaffold.scaffoldAuth({ project: dir })
  assert.equal(created.length, 0)
  assert.ok(skipped.length > 5)
  assert.equal(readFileSync(screen, 'utf8'), '// my edits\n')
})

await test('--force overwrites an edited screen', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  const screen = join(dir, 'src/auth/screens/SignIn.jsx')
  writeFileSync(screen, '// my edits\n')
  scaffold.scaffoldAuth({ project: dir, force: true })
  assert.notEqual(readFileSync(screen, 'utf8'), '// my edits\n')
})

await test('writeEnv appends to an existing .env instead of replacing it', () => {
  const dir = project()
  writeFileSync(join(dir, '.env'), 'VITE_OTHER=keep-me\n')
  const result = scaffold.writeEnv({ project: dir })
  assert.equal(result.action, 'appended')
  const env = readFileSync(join(dir, '.env'), 'utf8')
  assert.match(env, /VITE_OTHER=keep-me/, 'clobbered the existing .env')
  assert.match(env, new RegExp(scaffold.ENV_KEY))
})

await test('writeEnv leaves an existing VITE_API_BASE_URL untouched', () => {
  const dir = project()
  writeFileSync(join(dir, '.env'), `${scaffold.ENV_KEY}=https://mine.example/v1\n`)
  assert.equal(scaffold.writeEnv({ project: dir }).action, 'skipped')
  assert.equal(
    readFileSync(join(dir, '.env'), 'utf8'),
    `${scaffold.ENV_KEY}=https://mine.example/v1\n`
  )
})

await test('the .env template ships a placeholder, never a live URL', () => {
  const template = readFileSync(join(scaffold.TEMPLATES, 'env'), 'utf8')
  assert.match(template, /REPLACE-ME/, 'placeholder missing')
  assert.match(template, /^#/m, 'no comment explaining what to replace')
})

await test('wire backs up main.jsx and App.jsx before replacing them', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  const { written, backedUp } = scaffold.wireApp({ project: dir })
  assert.equal(written.length, 2)
  assert.equal(backedUp.length, 2)
  assert.equal(readFileSync(join(dir, 'src/main.jsx.bak'), 'utf8'), 'ORIGINAL MAIN\n')
  assert.equal(readFileSync(join(dir, 'src/App.jsx.bak'), 'utf8'), 'ORIGINAL APP\n')
  assert.match(readFileSync(join(dir, 'src/main.jsx'), 'utf8'), /auth-client\/style\.css/)
  assert.match(readFileSync(join(dir, 'src/App.jsx'), 'utf8'), /from '\.\/auth'/)
})

await test('undo restores the originals byte for byte', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  scaffold.wireApp({ project: dir })
  const { restored } = scaffold.undoWiring({ project: dir })
  assert.equal(restored.length, 2)
  assert.equal(readFileSync(join(dir, 'src/main.jsx'), 'utf8'), 'ORIGINAL MAIN\n')
  assert.equal(readFileSync(join(dir, 'src/App.jsx'), 'utf8'), 'ORIGINAL APP\n')
  assert.equal(existsSync(join(dir, 'src/App.jsx.bak')), false, 'backup left behind')
  assert.ok(existsSync(join(dir, 'src/auth/index.js')), 'undo must not remove src/auth')
})

await test('isWired only reports true once App.jsx imports ./auth', () => {
  const dir = project()
  assert.equal(scaffold.isWired({ project: dir }), false)
  scaffold.scaffoldAuth({ project: dir })
  scaffold.wireApp({ project: dir })
  assert.equal(scaffold.isWired({ project: dir }), true)
})

await test('the CLI exposes setup, init, env, wire and undo', () => {
  const cli = readFileSync(new URL('../dist/bin/auth-client.mjs', import.meta.url), 'utf8')
  for (const command of ['setup', 'init', 'env', 'wire', 'undo']) {
    assert.match(cli, new RegExp(`case '${command}'`), `missing command: ${command}`)
  }
})

await test('postinstall never reads input and never touches your files', () => {
  const code = codeOf('../dist/bin/postinstall.mjs')

  // It may WRITE to the terminal — npm hides a hook's stdout, so that is the
  // only way the notice is seen. It must never READ: the terminal's input
  // buffer holds escape-sequence replies to shell prompt themes, and consuming
  // one as an answer made the question cancel itself unprompted.
  assert.doesNotMatch(code, /openSync\('\/dev\/tty', 'r'\)/, 'the hook must not read the terminal')
  assert.doesNotMatch(code, /setRawMode|createInterface|spawnSync/, 'the hook must not prompt')
  assert.match(code, /openSync\('\/dev\/tty', 'w'\)/, 'the notice must reach the terminal npm hides output from')

  // And it must stay inside its own territory.
  assert.doesNotMatch(code, /writeEnv/, 'postinstall must not write .env')
  assert.doesNotMatch(code, /wireApp/, 'postinstall must not rewrite app files')
  assert.match(code, /catch/, 'postinstall must swallow its own errors')
  assert.match(code, /exit\(0\)/, 'postinstall must always exit 0')

  // It has to name the command that finishes the job.
  const source = readFileSync(new URL('../dist/bin/postinstall.mjs', import.meta.url), 'utf8')
  assert.match(source, /npx auth-client setup/, 'the notice must point at the next command')
})

await test('a cancelled question is left pending, and nothing times out', () => {
  const cli = codeOf('../dist/bin/auth-client.mjs')
  assert.match(cli, /createInterface/, 'setup owns the terminal, so readline is the right tool')
  // One interface for the run: closing one discards input typed ahead.
  assert.equal([...cli.matchAll(/createInterface\(/g)].length, 1, 'exactly one readline for the whole run')
  // No deadline on an answer, anywhere.
  assert.doesNotMatch(cli, /setTimeout/, 'questions must not time out')
  assert.doesNotMatch(codeOf('../dist/bin/postinstall.mjs'), /setTimeout|timeout:/, 'the install must impose no deadline')
  // Cancel must be distinguishable from a decline.
  assert.match(cli, /answer === false/, 'decline must be distinguished from cancelled')
  assert.match(cli, /status: 'declined'/, 'a decline must be recorded')
})

await test('no prompt library is shipped to consumers', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['axios'],
    'the install no longer prompts, so it needs no prompt library')
})

await test('setup ends with a summary that covers undo', () => {
  const cli = readFileSync(new URL('../dist/bin/auth-client.mjs', import.meta.url), 'utf8')
  assert.match(cli, /function summary/, 'no closing summary')
  assert.match(cli, /auth-client undo/, 'the summary must say how to undo')
  // Box padding is computed on visible width, so colour codes must be stripped
  // before measuring or every line is short by the length of its escapes.
  assert.match(cli, /replace\(\/\\x1b\\\[\[0-9;\]\*m\/g, ''\)/, 'box width must ignore ANSI codes')
})

await test('a fresh project reports every step pending', () => {
  const dir = project()
  const status = scaffold.stepStatus({ project: dir })
  assert.deepEqual(status, { auth: 'pending', env: 'pending', wire: 'pending' })
  assert.equal(scaffold.nextStep({ project: dir }), 'auth')
})

await test('setup interrupted at .env resumes at .env, not from the start', () => {
  const dir = project()
  // What an install that got as far as the .env question leaves behind.
  scaffold.scaffoldAuth({ project: dir })
  scaffold.recordStep({ project: dir, step: 'auth', status: 'done' })

  const status = scaffold.stepStatus({ project: dir })
  assert.equal(status.auth, 'done', 'the finished step must not be redone')
  assert.equal(status.env, 'pending')
  assert.equal(scaffold.nextStep({ project: dir }), 'env', 'must resume at env')
})

await test('an answered step is never asked again', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  scaffold.writeEnv({ project: dir })
  scaffold.recordStep({ project: dir, step: 'env', status: 'done' })
  assert.equal(scaffold.stepStatus({ project: dir }).env, 'done')
  assert.equal(scaffold.nextStep({ project: dir }), 'wire')
})

await test('a declined step is remembered, so re-running does not nag', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  scaffold.recordStep({ project: dir, step: 'env', status: 'declined' })
  assert.equal(scaffold.stepStatus({ project: dir }).env, 'declined')
  assert.equal(scaffold.nextStep({ project: dir }), 'wire', 'declined must not block the next step')
})

await test('the filesystem overrides a stale state file', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  // Claim nothing is done while the work is visibly present.
  writeFileSync(join(dir, scaffold.STATE_FILE), JSON.stringify({ steps: {} }))
  scaffold.writeEnv({ project: dir })
  scaffold.wireApp({ project: dir })
  const status = scaffold.stepStatus({ project: dir })
  assert.deepEqual(status, { auth: 'done', env: 'done', wire: 'done' })
})

await test('deleting the state file does not re-run completed steps', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  scaffold.writeEnv({ project: dir })
  rmSync(join(dir, scaffold.STATE_FILE), { force: true })
  assert.equal(scaffold.stepStatus({ project: dir }).env, 'done')
})

await test('a corrupt state file degrades instead of throwing', () => {
  const dir = project()
  scaffold.scaffoldAuth({ project: dir })
  writeFileSync(join(dir, scaffold.STATE_FILE), 'not json {{{')
  assert.doesNotThrow(() => scaffold.stepStatus({ project: dir }))
  assert.equal(scaffold.stepStatus({ project: dir }).env, 'pending')
})

await test('the state file lives inside src/auth, not the project root', () => {
  assert.match(scaffold.STATE_FILE, /^src\/auth\//)
})

await test('the generated folder is self-contained', () => {
  const files = readdirSync(join(scaffold.TEMPLATES, 'auth'), { recursive: true })
    .filter((f) => /\.(jsx?|css)$/.test(f))
  assert.ok(files.length >= 18, `expected screens + components locally, got ${files.length}`)

  // Only the auth engine may come from the package. Everything visual — the
  // screens AND the primitives they are built from — has to be local, or a
  // project cannot restyle without forking.
  const allowed = new Set(["'@7edge/auth-client'", "'@7edge/auth-client/config'"])
  const offenders = []
  for (const file of files) {
    const source = readFileSync(join(scaffold.TEMPLATES, 'auth', file), 'utf8')
    for (const [, clause, spec] of source.matchAll(/import\s+([^;]+?)\s+from\s+('[^']+')/g)) {
      if (!allowed.has(spec)) continue
      const names = clause.replace(/[{}]/g, '').split(',').map((n) => n.trim()).filter(Boolean)
      const extra = names.filter((n) => n !== 'useAuth')
      if (extra.length) offenders.push(`${file}: ${extra.join(', ')}`)
    }
  }
  assert.deepEqual(offenders, [], `these should be local files, not package imports — ${offenders.join(' | ')}`)
  return `${files.length} local files, only useAuth from the package`
})

await test('no config file is dumped into the project', () => {
  const files = readdirSync(join(scaffold.TEMPLATES, 'auth'), { recursive: true })
  assert.ok(!files.includes('config.js'), 'config.js must live in the package, not src/auth')
  const barrel = readFileSync(join(scaffold.TEMPLATES, 'auth/index.js'), 'utf8')
  assert.match(barrel, /from '@7edge\/auth-client\/config'/, 'the barrel should pull config from the package')
})

await test('the config subpath ships unbundled so the consumer resolves the env', () => {
  // Bundling it would let OUR build substitute import.meta.env and bake in an
  // empty string. It has to reach the consumer as plain source.
  const config = readFileSync(new URL('../dist/config.js', import.meta.url), 'utf8')
  assert.match(config, /import\.meta\.env\?\.VITE_API_BASE_URL/, 'the env read was substituted away')
  const root = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(root, /VITE_API_BASE_URL \?\?/, 'config must not be bundled into the root entry')
})

await test('a placeholder base URL fails loudly instead of silently', () => {
  assert.throws(
    () => createAuthClient({ baseURL: 'https://REPLACE-ME.execute-api.ap-south-1.amazonaws.com/v1' }),
    /still the placeholder/
  )
  assert.throws(() => createAuthClient({ baseURL: '' }), /VITE_API_BASE_URL/)
})

await test('generated files carry a one-line note, not an essay', () => {
  const screen = readFileSync(join(scaffold.TEMPLATES, 'auth/screens/SignIn.jsx'), 'utf8')
  const header = screen.split('\n').findIndex((l) => l.startsWith('import'))
  assert.ok(header <= 1, `${header} lines of preamble before the first import`)
})

await test('the generated home page shows session state and builds on the theme', () => {
  const app = readFileSync(join(scaffold.TEMPLATES, 'app/App.jsx'), 'utf8')
  const css = readFileSync(join(scaffold.TEMPLATES, 'auth/home.css'), 'utf8')
  for (const bit of ['expiresIn', 'decodeJWT', 'force-refresh', 'ChangePassword', 'DeleteAccount']) {
    assert.match(app, new RegExp(bit), `home page lost ${bit}`)
  }
  assert.match(css, /--ac-accent/, 'home page styling should reuse the library theme variables')
})

await test('the .env template carries no example URL', () => {
  const template = readFileSync(join(scaffold.TEMPLATES, 'env'), 'utf8')
  assert.doesNotMatch(template, /Example:/, 'the example line was removed on purpose')
  const live = template.split('\n').filter((l) => l.includes('execute-api') && !l.includes('REPLACE-ME'))
  assert.deepEqual(live, [], `no live URL may ship: ${live.join(' | ')}`)
})

temps.forEach((dir) => rmSync(dir, { recursive: true, force: true }))

// ── report ──────────────────────────────────────────────────────────────────

await server.close()

const pad = (n) => String(n).padStart(2, ' ')
results.forEach((result, index) => {
  console.log(`${result.ok ? ' ok ' : 'FAIL'} ${pad(index + 1)}. ${result.name}`)
  if (!result.ok) console.log(`      ${result.error.message.split('\n')[0]}`)
})

console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
