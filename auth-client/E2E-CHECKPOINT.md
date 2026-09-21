# E2E checkpoint — live API

**API** `https://4dr8gif643.execute-api.ap-south-1.amazonaws.com/v1`
**Harness** a fresh `npm create vite` React app, package installed, driven by Playwright.
**Accounts** `nishan.kumar+N@7edge.com` / `Poiuy@09876`

Status: `—` not run · `PASS` · `FAIL` · `BLOCKED`

**Last full run** 2026-09-16 — 71/71 browser checks pass, plus 66/66 package
assertions (`npm run verify`). The four `BLOCKED` rows below are all downstream
of finding 1 and are server-side; nothing in the library is failing.

| Suite | Result |
|---|---|
| `run.mjs` — live API journey | 15/15 |
| `screens-a/b/c.mjs` — every screen, field by field | 33/33 |
| `bugfix.mjs` — error-clearing regressions | 5/5 |
| `bug2.mjs` — identifier-switch clears credentials | 4/4 |
| `audit.mjs` — double-submit, Enter, aria-busy, trimming | 5/5 |
| `home.mjs` — the generated home page | 9/9 |
| `npm run verify` — artifact, install contract, resume, ejection | 66/66 |

All browser suites run against a **clean install of the packed artifact**, using
the shipped `App.jsx` template (plus a `?screen=` harness for isolating screens).

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
| H2 | `src/auth/` scaffolded by the install | PASS | 11 files, and **nothing outside `src/auth/`** |
| H3 | Production build succeeds | PASS | production build clean |
| H4 | No console or page errors across the run | PASS | no console or page errors across the run |

---

## I · Install & setup flow

Cold-run against a fresh `npm create vite` app, package installed from the
packed dist repo.

| # | Check | Status | Notes |
|---|---|---|---|
| I1 | `npm install` writes `src/auth/` only | PASS | `.env`, `main.jsx`, `App.jsx` untouched; only `package.json`/`package-lock.json` change, by npm itself |
| I2 | `src/auth/NEXT-STEPS.txt` left as the reminder | PASS | npm hides postinstall output, so the note goes on disk |
| I3 | `setup` prompts before `.env` | PASS | declining prints the block to paste by hand |
| I4 | `.env` is **appended**, never replaced | PASS | pre-existing `VITE_OTHER=keep-me` survived |
| I5 | `.env` ships a `REPLACE-ME` placeholder + comment | PASS | no live URL baked into the template |
| I6 | An existing `VITE_API_BASE_URL` is left alone | PASS | re-running `setup` is a no-op |
| I7 | `setup` prompts before wiring, defaults to **no** | PASS | declining prints both files to paste |
| I8 | `wire` backs up `main.jsx` + `App.jsx` as `.bak` | PASS | originals preserved byte for byte |
| I9 | `undo` restores both originals | PASS | byte-identical; `src/auth/` deliberately kept |
| I10 | Re-running `setup` does not clobber existing wiring | PASS | detects `App.jsx` already importing `./auth` |
| I11 | Ctrl+C / Ctrl+D at a prompt exits cleanly | PASS | was a raw Node stack trace — fixed; the step stays pending, not declined |
| I12 | Non-TTY (CI, piped) does not hang | PASS | skips the prompt and says so; `--yes` accepts everything |
| I13 | Wired app builds and signs in end to end | PASS | no sign-in flash on reload |
| I14 | `npm install` scaffolds and prints the next command | PASS | 3s, no prompt; notice written to `/dev/tty` because npm hides hook stdout, and rendered intact via a terminal emulator |
| I15 | Install writes only `src/auth/` | PASS | `.env`, `main.jsx`, `App.jsx` untouched |
| I16 | `NEXT-STEPS.txt` names the outstanding steps | PASS | rewritten each install, removed when nothing is left |
| I16b | In-install prompting — **removed** | N/A | built and withdrawn. Two blockers, both measured: npm repaints the cursor's line ~40×/sec (320 redraws in 8s) and cannot be silenced from a hook (`--foreground-scripts` 318, `spawnSync` does not block it, `process.ppid` is the shell not npm); and the terminal's input buffer carries escape-sequence replies to shell prompt themes — one was read as `\x1b` and cancelled the question before the user touched anything |
| I16c | The hook never reads input | PASS | asserted in `npm run verify`, so it cannot stall an install |
| I17 | Interrupted at `.env`, next run resumes at `.env` | PASS | `auth: done` recorded, `env` left pending |
| I18 | Answered steps are never re-asked | PASS | `Resuming — 1 step left: wire` |
| I19 | A declined step is remembered | PASS | not re-asked; `setup --all` re-offers it |
| I20 | Deleting the progress record is safe | PASS | state re-derived from the files; nothing re-runs |
| I21 | A corrupt progress record degrades | PASS | treated as empty, no throw |
| I22 | **Re-installing does NOT resume** | **KNOWN LIMIT** | npm prints `up to date` and runs no hook, `--force` included — resume via `npx auth-client setup` |
| I23 | No `config.js` in the project | PASS | moved to `@7edge/auth-client/config`, shipped unbundled so the consumer's Vite resolves `VITE_API_BASE_URL` |
| I24 | Placeholder base URL throws with the fix in the message | PASS | also covers an empty/missing value |
| I25 | Generated folder is self-contained | PASS | 20 local files; `useAuth` is the only package import |
| I26 | Every relative import in the generated tree resolves | PASS | enforced at build time — caught a real break in `validation.js` |
| I27 | The app template only imports names the barrel exports | PASS | enforced at build time — caught a missing `decodeJWT` |
| I28 | A local component edit takes effect | PASS | structure/copy/props freely; classes limited to the precompiled set |
| I29 | A new Tailwind utility in a local component | **KNOWN LIMIT** | `style.css` is precompiled, so `bg-purple-600` renders unstyled — plain CSS in `home.css` works, or install Tailwind |

---

## J · Generated home page

| # | Check | Status | Notes |
|---|---|---|---|
| J1 | Sign-in lands on the generated home page | PASS | `Signed in as nishan.kumar+1@7edge.com` |
| J2 | Shows the API base URL in use | PASS | read from `VITE_API_BASE_URL` |
| J3 | idToken expiry counts down live | PASS | 3600s → 3597s over 3s |
| J4 | Decoded JWT claims + truncated tokens | PASS | `token_use=id`, `accessToken` renders `null` as expected |
| J5 | Force refresh is wired | PASS | fires `/auth/refresh`; session survives its 401 (finding 1) |
| J6 | Change password / Delete account open and return | PASS | both reachable from the home page |
| J7 | Themed, not unstyled | PASS | card `rgb(255,255,255)`, radius 12px from the theme variables |
| J8 | Log out returns to sign-in | PASS | storage cleared |
| J9 | No unexpected console errors | PASS | only the known `/auth/refresh` 401 |

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
