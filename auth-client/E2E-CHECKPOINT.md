# E2E checkpoint — live API

**API** `https://4dr8gif643.execute-api.ap-south-1.amazonaws.com/v1`
**Harness** a fresh `npm create vite` React app, package installed, driven by Playwright.
**Accounts** `nishan.kumar+N@7edge.com` / `Poiuy@09876`

Status: `—` not run · `PASS` · `FAIL` · `BLOCKED`

---

## Contract deltas found in the swagger

These are the behaviour changes the real API forces. Recorded here because the
library was written against a different assumption.

| Endpoint | Library assumed | Real API |
|---|---|---|
| `POST /auth/signin` | returns `{ message }`, OTP required next | returns `{ idToken, refreshToken, user }` — **authenticated immediately, no OTP** |
| `POST /auth/verify-otp` | returns the token bundle, authenticates | returns `{ message }` — confirms a **new account** only, then you sign in |
| `POST /auth/logout` | body `{ refreshToken }` | **Bearer auth**, empty body |
| `POST /auth/forgot-password` | `{ identifier, … }` | `{ email }` or `{ phone }` |
| `POST /auth/reset-password` | `{ identifier, resetToken, newPassword }` | `{ resetToken, newPassword }` |
| `POST /auth/resend-otp` | `{ identifier, purpose }` | `{ identifier }` |
| `POST /auth/tokens` | `fetchTokens()` | **Not implemented** |
| token bundle | `id_token, access_token, refresh_token, session_token, expires_in` | `idToken, refreshToken` only — **no accessToken** |

---

## A · Sign up

| # | Check | Status | Notes |
|---|---|---|---|
| A1 | Valid details → OTP sent, OTP screen shown | PASS | `200 /auth/signup` → OTP screen |
| A2 | Password below 8 chars → inline validation, no request | PASS | client-side, no request |
| A3 | Mismatched confirm password → inline validation | PASS | client-side, no request |
| A4 | Duplicate email → server error surfaced | PASS | `An account with that email/phone already exists` |
| A5 | Wrong OTP → error, stays on OTP screen | PASS | `Incorrect verification code`, stays on screen |
| A6 | Resend OTP → fresh code accepted | PASS | `200 /auth/resend-otp` — UI gates the button behind a 60s countdown |
| A7 | Correct OTP → confirmed, routed to **Sign in** (not authenticated) | PASS | UI: routed to Sign in, no tokens, notice `Account verified. Sign in to continue.` |
| A8 | The just-confirmed account then signs in | PASS | authenticated in one step, no OTP screen |

## B · Sign in — OTP removed

| # | Check | Status | Notes |
|---|---|---|---|
| B1 | Correct credentials → **straight to dashboard, no OTP screen** | **PASS** | **1 signin call, 0 verify-otp calls** — the requested change |
| B2 | Tokens persisted at `auth_tokens` | PASS | `id_token, refresh_token` |
| B3 | Wrong password → `Incorrect credentials` | PASS | `Incorrect credentials` |
| B4 | Unknown email → same message (no account enumeration) | PASS | same message as a wrong password — no enumeration |
| B5 | Unconfirmed account → actionable error | PASS | blocked, but see finding 3 |
| B6 | Empty form → inline errors, no network call | PASS | 0 network calls |
| B7 | Malformed email → inline validation | PASS | `Enter a valid email address` |

## C · Tokens

| # | Check | Status | Notes |
|---|---|---|---|
| C1 | `idToken` is a 3-part JWT with a live `exp` | PASS | 3 parts, ttl 3600s |
| C2 | Claims decode (sub, email) | PASS | sub, email, `token_use=id`, Cognito issuer |
| C3 | `refreshToken` stored, kept off React state | PASS | value via getRefreshToken(); `refreshToken` is the method |
| C4 | `accessToken` absent — API issues none | PASS | null, as the contract implies |
| C5 | Manual `refreshToken()` → new idToken | BLOCKED | `/auth/refresh` 401s — finding 1 |
| C6 | Refresh token rotates; old one rejected | BLOCKED | same |
| C7 | Concurrent refreshes → **one** network call | BLOCKED | `/auth/refresh` 401s — finding 1 |
| C8 | `Authorization: Bearer` on authenticated routes only | PASS | change-password yes · signin/signup no |
| C9 | 401 → one refresh → request replayed | PASS | after the hardening fix — session survives, error surfaces |
| C10 | Session survives a full page reload | PASS | rehydrated from localStorage |
| C11 | Cross-tab logout propagates | PASS | second tab signed out |

## D · Change password

| # | Check | Status | Notes |
|---|---|---|---|
| D1 | Wrong current password → error, **session preserved** | PASS | `Current password is incorrect`, session intact |
| D2 | Correct → success | PASS | confirmation screen shown |
| D3 | Sign in with the new password works | PASS | signs in with the new password |
| D4 | Old password rejected | PASS | old password rejected |

## E · Forgot / reset password

| # | Check | Status | Notes |
|---|---|---|---|
| E1 | Forgot password → reset code sent | PASS | `200 /auth/forgot-password` → reset OTP screen |
| E2 | Wrong reset OTP → error | PASS | `Incorrect verification code` |
| E3 | Correct OTP → `resetToken` issued | PASS | signed token: `{identifier, expires_at}` + HMAC, 15 min window |
| E4 | Reset password succeeds | PASS | `200 Password reset successfully` |
| E5 | Sign in with the reset password works | PASS | authenticated in the UI |
| E6 | Reset token cannot be replayed | **FAIL** | **replayable — 3 successive replays all returned 200. See finding 2.** |

## F · Delete account

| # | Check | Status | Notes |
|---|---|---|---|
| F1 | Wrong password → error, **session preserved** | PASS | `Password is incorrect`; both gates (checkbox + password) enforced |
| F2 | Correct password → deleted and signed out | PASS | storage cleared |
| F3 | Deleted account can no longer sign in | PASS | `Incorrect credentials` |

## G · Logout

| # | Check | Status | Notes |
|---|---|---|---|
| G1 | Storage cleared | PASS | auth_tokens removed |
| G2 | Refresh token revoked server-side | BLOCKED | cannot verify revocation while /auth/refresh 401s |

## H · Harness

| # | Check | Status | Notes |
|---|---|---|---|
| H1 | Fresh Vite app, package installs | PASS | fresh `npm create vite`, package installed from the packed repo artifact |
| H2 | `src/auth/` + `.env` auto-scaffolded | PASS | 10 files + .env, no mock flag |
| H3 | Production build succeeds | PASS | production build clean |
| H4 | No console or page errors across the run | PASS | no console or page errors across the run |

---

## Findings

### 1 · `/auth/refresh` rejects every valid refresh token — BLOCKER

```
POST /auth/refresh  {"refreshToken":"<valid, 1782 chars>"}  →  401 {"message":"Incorrect credentials"}
```

Server-side, not the library:

- the swagger-exact body `{ refreshToken }` alone fails
- so do `+ email`, `+ username`, `+ user_id`, and `+ Authorization: Bearer <idToken>`
- an empty body correctly returns `400 refreshToken is required`, so the handler
  parses the body and *then* fails authentication
- the **same session's** idToken succeeds on `/auth/logout` → 200, so the session
  itself is valid

Likely cause: the Cognito app client has a secret, so `REFRESH_TOKEN_AUTH`
requires a `SECRET_HASH` derived from the username — which the request does not
carry. Either compute it in the Lambda (from the refresh token's `sub`) or use
an app client without a secret.

**Impact:** idTokens live 3600s. At ~59 minutes the proactive refresh fires,
fails, and the session ends. Every user is logged out after an hour.

Blocks C5, C6, C7, G2.

### 2 · Reset tokens are replayable — SECURITY

`POST /auth/reset-password` accepts the same `resetToken` repeatedly. Three
successive calls each returned `200 Password reset successfully`.

The token is self-contained and stateless:

```json
{ "identifier": "nishan.kumar+1@7edge.com", "expires_at": 1789468036655 }
```
plus an HMAC. There is no nonce, no `jti`, and no server-side record — so
nothing exists to invalidate when it is used. It stays valid for its full
15-minute window however many times it is presented.

Anyone who obtains a reset token (browser history, logs, a forwarded link) can
change the password repeatedly within that window. Fix: record the token (or a
nonce inside it) server-side and reject it after first use.

### 3 · 401 is overloaded for credential errors

`/auth/change-password` and `/auth/delete-account` both return **401** when the
supplied password is wrong. 401 means "your token is invalid", so the library's
interceptor refreshed and — with finding 1 in play — logged the user out. A typo
signed them out.

Hardened in the library: a failed refresh now only ends the session when the
stored idToken is genuinely expired. Still worth fixing server-side — a wrong
password is a validation failure, so **400** or **422**.

### 4 · Unconfirmed accounts are indistinguishable from bad credentials

Signing in to an unconfirmed account returns `401 Incorrect credentials`, the
same as a wrong password. The UI cannot detect the case, so it cannot offer
"resend confirmation code". Surfacing Cognito's `UserNotConfirmedException` as a
`code` would fix it.

### 5 · `/auth/tokens` is Not implemented

`fetchTokens()` was removed from the library rather than ship a method that 500s.
