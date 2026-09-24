# Integration guide

For a developer adding `@7edge/auth-client` to an application. Read this
start to finish once; after that, use the table of contents.

For how the library works internally, see [ARCHITECTURE.md](./ARCHITECTURE.md).
If you do not have an auth API yet, start with
[GETTING-STARTED.md](../../docs/GETTING-STARTED.md), which provisions Cognito
and deploys the backend first.

- [What this library does](#what-this-library-does)
- [Before you start](#before-you-start)
- [1. Install](#1-install)
- [2. What install created](#2-what-install-created)
- [3. Point it at your API](#3-point-it-at-your-api)
- [4. Wire it into your app](#4-wire-it-into-your-app)
- [5. Run it](#5-run-it)
- [Integration paths](#integration-paths)
  - [Path A — prebuilt screens](#path-a--prebuilt-screens)
  - [Path B — your own screens, our hook](#path-b--your-own-screens-our-hook)
  - [Path C — headless, no React](#path-c--headless-no-react)
- [The user journeys](#the-user-journeys)
- [Calling your own API with the session](#calling-your-own-api-with-the-session)
- [Protecting routes](#protecting-routes)
- [Post-auth screens](#post-auth-screens)
- [Theming](#theming)
- [Configuration reference](#configuration-reference)
- [Method reference](#method-reference)
- [Backend contract](#backend-contract)
- [Framework notes](#framework-notes)
- [Troubleshooting](#troubleshooting)

---

## What this library does

It owns the *client half* of authentication:

- Runs the sign-up (with account confirmation), sign-in, password reset and
  account-deletion journeys against your API.
- Persists the token bundle and keeps it fresh — proactive refresh before
  expiry, a single-flight lock so concurrent requests share one refresh, and a
  401-retry safety net.
- Keeps every open browser tab in agreement about who is signed in.
- Optionally supplies the seven screens, ejected into your project as ordinary
  files you own and edit.

It does **not** issue or validate tokens, and it has no offline or mock mode.
A reachable API implementing the [backend contract](#backend-contract) is
required — there is nothing to demo against without one.

---

## Before you start

| Requirement | Notes |
|---|---|
| Node | 18 or newer |
| React | 18 or newer — a *peer* dependency, and optional. Skip it for [Path C](#path-c--headless-no-react). |
| An auth API | Must implement the [backend contract](#backend-contract). |

`axios` is a real dependency and comes with the package. React and
`react-dom` are peers on purpose: the library must use *your* copy of React,
never a second one, or hooks break.

---

## 1. Install

```bash
npm install github:Nishan666/auth-client
```

The package is installed from GitHub — it is not published to npm, so
`npm install @7edge/auth-client` fails with a 404. `@7edge/auth-client` is the
name you *import* by; the git URL is how you install it.

Installing scaffolds `src/auth/` and deliberately touches nothing else — not
`.env`, not `main.jsx`, not `App.jsx`. It also drops
`src/auth/NEXT-STEPS.txt` listing what is left; delete it once you are done.

Finish the wiring with:

```bash
npx auth-client setup
```

`setup` asks before each step that modifies a file, and prints the manual
equivalent if you decline:

| Prompt | What it does |
|---|---|
| *Create / append `.env`* | adds `VITE_API_BASE_URL`; appends to an existing file, never replaces it |
| *Wire them up now?* | rewrites `src/main.jsx` and `src/App.jsx`, saving `.bak` copies of both first |

The other commands:

```bash
npx auth-client status            # what is done, what is left
npx auth-client undo              # restore main.jsx and App.jsx from .bak
npx auth-client init              # scaffold src/auth/ only
npx auth-client env               # the .env step only
npx auth-client wire              # the main.jsx/App.jsx step only
npx auth-client init --force      # overwrite the scaffold (e.g. after an upgrade)
```

`--force` overwrites your edited screens. Commit first.

---

## 2. What install created

```
src/auth/
  index.js           the barrel — import auth from here and nowhere else
  AuthFlow.jsx       the pre-auth screen router
  screens/           SignIn, SignUp, OtpVerify, ForgotPassword,
                     ResetPassword, ChangePassword, DeleteAccount
  components/        AuthCard, Button, FormField, PasswordField,
                     IdentifierInput, Alert, LoadingSpinner
  validation.js      the field rules
  constants.js       screen names, identifier types, OTP settings
  home.css           styling for the generated home page
```

**All of it is yours.** Rewrite the copy, restyle it, swap in your own design
system, delete what you don't need. A package upgrade will not touch it, and
you never need to fork the library to change how auth looks. The only thing a
generated file imports from the package is the auth engine itself.

The screens and primitives are *generated* from `src/ui/` at build time, so the
copy you get can't have silently drifted from the library it talks to.

There is no local config file: `authConfig` is re-exported from the package and
reads `VITE_API_BASE_URL` itself. Import from the barrel — `./auth` — rather
than from the package directly, so the wiring stays in one place:

```js
import { AuthProvider, useAuth, AuthFlow, authConfig } from './auth'
```

---

## 3. Point it at your API

`npx auth-client setup` writes a **placeholder**, not a working URL:

```bash
VITE_API_BASE_URL=https://REPLACE-ME.execute-api.ap-south-1.amazonaws.com/v1
```

Replace it with your API's base URL:

```bash
VITE_API_BASE_URL=https://api.example.com/api
```

Restart the dev server after changing it — Vite reads `.env` only at startup.
Leaving the placeholder in produces a network error on the first request, not a
build error, so it is easy to miss.

The base URL is **required**. `createAuthClient` throws without one, rather
than silently posting to your own origin.

`authConfig` reads `import.meta.env.VITE_API_BASE_URL`. On a non-Vite bundler
that variable does not exist, so build the config yourself and pass it to the
provider instead:

```js
// src/auth/config.js — your file, create it
export const authConfig = {
  baseURL: process.env.REACT_APP_API_BASE_URL,  // Next.js: NEXT_PUBLIC_API_BASE_URL
  expirySkewSeconds: 30,
  crossTab: true,
  onForceLogout: () => { window.location.href = '/login' },
}
```

---

## 4. Wire it into your app

Two things: import the stylesheet once, and wrap your app in the provider.

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@7edge/auth-client/style.css'   // once, at the root
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```jsx
// src/App.jsx
import { AuthProvider, useAuth, AuthFlow, authConfig } from './auth'

function Shell() {
  const { isAuthenticated, user, logout } = useAuth()

  if (!isAuthenticated) return <AuthFlow />

  return (
    <main>
      <p>Signed in as {user?.email ?? user?.phone}</p>
      <button onClick={logout}>Sign out</button>
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider config={authConfig}>
      <Shell />
    </AuthProvider>
  )
}
```

That is the whole integration. `AuthFlow` handles sign-in, sign-up, account
confirmation and the password-reset journey; `isAuthenticated` flips the moment
sign-in succeeds, and your app renders.

`Shell` is a separate component on purpose: `useAuth()` cannot run inside `App`
itself, because a component cannot consume a context that it renders the
provider for. The generated `App.jsx` calls the same split `Root`.

On a fresh Vite app, delete the starter stylesheets — the generated files import
`@7edge/auth-client/style.css` and `src/auth/home.css` instead, leaving Vite's
orphaned and liable to interfere:

```bash
rm -f src/App.css src/index.css
```

The stylesheet is scoped — it carries no global reset, so it will not restyle
your pages. Skip it only if you are on [Path B](#path-b--your-own-screens-our-hook)
or [C](#path-c--headless-no-react) and render none of the built-in screens.

### Sharing one client with non-React code

The package exposes a lazy singleton, `getAuthClient()`. Pass it instead of
`config` when your API layer also needs the session — then React and your fetch
wrapper are looking at the same client:

```jsx
import { AuthProvider } from './auth'
import { getAuthClient } from '@7edge/auth-client/config'

<AuthProvider client={getAuthClient()}>…</AuthProvider>
```

`getAuthClient()` builds the client on first call from `authConfig` and returns
that same instance forever after, so importing it from several modules is safe.
Pass overrides on the first call only: `getAuthClient({ onForceLogout })`.

Pass `client` **or** `config`, not both. Either is read once, on first render;
changing it later has no effect, by design — the instance is stable for the
provider's lifetime.

---

## 5. Run it

```bash
npm run dev
```

Walk the journeys end to end against a real API:

1. **Sign up** → an OTP is sent; you are *not* signed in yet.
2. **Enter the code** → tokens are stored, `isAuthenticated` becomes true.
3. **Reload the page** → still signed in; the session rehydrates from storage.
4. **Open a second tab, sign out in one** → the other clears too.
5. **Forgot password** → code → new password → sign in with it.
6. **Sign out** → the refresh token is revoked server-side.

Inspect `localStorage` while you do: `auth_tokens` holds one JSON bundle,
`auth_user` the profile.

---

## Integration paths

Pick one. They are not exclusive — the same client backs all three.

### Path A — prebuilt screens

What [step 4](#4-wire-it-into-your-app) does. Fastest, and you still own the
screen files.

```jsx
<AuthProvider config={authConfig}>
  {isAuthenticated ? <App /> : <AuthFlow />}
</AuthProvider>
```

`AuthFlow` accepts:

| Prop | Type | Meaning |
|---|---|---|
| `initialScreen` | one of `AUTH_SCREENS` | Which screen to open on. Default `signin`. |
| `onAuthenticated` | `(data) => void` | Fired the instant OTP verification succeeds, with the API's response. Use it to redirect. |

```jsx
import { AUTH_SCREENS } from '@7edge/auth-client'

<AuthFlow
  initialScreen={AUTH_SCREENS.SIGN_UP}
  onAuthenticated={() => navigate('/dashboard')}
/>
```

Screen keys: `SIGN_IN`, `SIGN_UP`, `OTP`, `FORGOT_PASSWORD`,
`RESET_PASSWORD_OTP`, `RESET_PASSWORD`.

`ChangePassword` and `DeleteAccount` are **not** in `AuthFlow` — they belong to
an already-signed-in area. See [post-auth screens](#post-auth-screens).

### Path B — your own screens, our hook

Use `useAuth()` and build the forms yourself. Nothing about the library
requires the built-in UI.

```jsx
import { useState } from 'react'
import { useAuth } from './auth'

function MySignIn() {
  const { signIn, isLoading, error } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })

  async function submit(event) {
    event.preventDefault()
    // Sign-in authenticates directly — the session is persisted for you and
    // isAuthenticated flips. There is no OTP round here.
    await signIn(form)
  }

  return (
    <form onSubmit={submit}>
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input type="password" value={form.password}
             onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {error && <p role="alert">{error}</p>}
      <button disabled={isLoading}>Sign in</button>
    </form>
  )
}
```

**No method throws.** Every one resolves to a result object — branch on
`result.error`, never `try`/`catch`:

```js
const result = await verifyOtp({ identifier, otp })

if (result.error) {
  // result.message  human-readable, safe to display
  // result.code     machine-readable, e.g. 'OTP_INVALID', 'NETWORK_ERROR'
  // result.status   HTTP status, when there was a response
} else {
  // result.data     the API's response body
}
```

You can reuse the library's validators so your forms match the built-in rules:

```js
import { validateIdentifier, validatePassword, validateConfirmation,
         MIN_PASSWORD_LENGTH, IDENTIFIER_TYPE } from '@7edge/auth-client'

validateIdentifier('jane@example.com', IDENTIFIER_TYPE.EMAIL) // '' when valid
validatePassword('short')                                     // error message
```

Individual primitives (`AuthCard`, `Button`, `FormField`, `PasswordField`,
`IdentifierInput`, `Alert`, `LoadingSpinner`) are exported too, if you want
the look without the screens. Keep the `ac-root` class on your outermost
element — it scopes the stylesheet's reset.

### Path C — headless, no React

`@7edge/auth-client/core` has no React anywhere in its import graph. Use it
from Node scripts, a service worker, Vue/Svelte, or a non-React host.

```js
import { createAuthClient } from '@7edge/auth-client/core'

const auth = createAuthClient({ baseURL: process.env.API_BASE_URL })

auth.subscribe((state) => {
  console.log(state.isAuthenticated, state.user)
})

await auth.signIn({ email, password })   // authenticates
const token = await auth.getValidToken()
```

Outside a browser there is no `localStorage`; the store falls back to memory,
so the session lasts as long as the process. Pass your own adapter to persist
it — any object with `getItem` / `setItem` / `removeItem`:

```js
createAuthClient({
  baseURL,
  storage: {
    getItem: (k) => fs.existsSync(k) ? fs.readFileSync(k, 'utf8') : null,
    setItem: (k, v) => fs.writeFileSync(k, v),
    removeItem: (k) => fs.rmSync(k, { force: true }),
  },
})
```

The same escape hatch swaps `localStorage` for `sessionStorage` in a browser
when you want the session to die with the tab.

---

## The user journeys

Two things surprise people, so they are worth stating plainly.

**The OTP confirms a new account; it does not sign anyone in.** A code is sent
once, at sign-up. `verifyOtp()` confirms the account and returns a message —
no tokens. `signIn()` is what authenticates, and it does so on the first call:

```
signUp ──► code emailed ──► verifyOtp (account confirmed) ──┐
                                                            ▼
                                     signIn ──► tokens ──► authenticated
```

Sign-in has no second factor. That is Cognito's design here: its built-in
sender can only deliver messages Cognito composes itself, so an OTP on every
sign-in would need a verified SES identity. If you want a second factor, use
Cognito's own MFA rather than a hand-rolled challenge chain.

**Password reset uses a different OTP purpose and a different verify call.**
`verifyResetOtp()` returns a short-lived, single-use `resetToken` — it does
not sign anyone in:

```
forgotPassword ──► OTP sent ──► verifyResetOtp ──► resetToken ──► resetPassword ──► sign in
```

Full sequence, hand-rolled:

```js
// Sign up — two steps, neither of which authenticates
await auth.signUp({ firstName, lastName, email, password })
await auth.verifyOtp({ identifier: email, otp })      // account confirmed

// Sign in — this is what authenticates
await auth.signIn({ email, password })                // now authenticated

// Code didn't arrive (only applies to an unconfirmed account)
await auth.resendOtp({ identifier: email, purpose: 'auth' })

// Reset
await auth.forgotPassword({ identifier: email, email })
const { data } = await auth.verifyResetOtp({ identifier: email, otp })
await auth.resetPassword({ identifier: email, resetToken: data.resetToken, newPassword })

// While signed in
await auth.changePassword({ currentPassword, newPassword })
await auth.deleteAccount({ password })                // clears the session on success
await auth.signOut()                                  // revokes server-side, then clears
```

Use `phone` in place of `email` for phone identifiers; the built-in screens
send whichever the user picked, plus an `identifier` field.

---

## Calling your own API with the session

The auth client's axios instance is for *auth routes*. For your own API, ask
for a valid token and attach it yourself. `getValidToken()` refreshes first if
the token is expired or inside the skew window, so what you get is usable:

```js
// src/api/client.js
import axios from 'axios'
import { getAuthClient } from '@7edge/auth-client/config'

const authClient = getAuthClient()

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })

api.interceptors.request.use(async (config) => {
  const token = await authClient.getValidToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      try {
        const token = await authClient.refreshToken()
        error.config.headers.Authorization = `Bearer ${authClient.getIdToken()}`
        return api(error.config)
      } catch {
        authClient.signOut()
      }
    }
    return Promise.reject(error)
  }
)
```

Because the refresh lock lives in the client, your interceptor and the
library's share it: ten simultaneous 401s produce exactly one refresh call.

With `fetch`:

```js
const token = await authClient.getValidToken()
const response = await fetch(url, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})
```

**Always `await getValidToken()`.** Reading `getIdToken()` gives you whatever
is in storage, expired or not.

---

## Protecting routes

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth'

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

<Routes>
  <Route path="/login" element={<AuthFlow onAuthenticated={() => navigate('/')} />} />
  <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
</Routes>
```

`isAuthenticated` is read synchronously from storage on the first render, so
there is no authenticated-but-flickering-to-login frame on reload.

Send users to the login route when the session dies irrecoverably, via
`onForceLogout` in `config.js`:

```js
onForceLogout: () => { window.location.href = '/login' }
```

That fires when a refresh fails — an expired or revoked refresh token, a
deleted account, a password changed elsewhere — and once per tab when another
tab signs out.

---

## Post-auth screens

`ChangePassword` and `DeleteAccount` are exported separately. Mount them
inside your signed-in area:

```jsx
import { ChangePassword, DeleteAccount } from './auth'

<Route path="/settings/password" element={
  <ChangePassword onSuccess={() => navigate('/settings')}
                  onCancel={() => navigate('/settings')} />
} />

<Route path="/settings/delete" element={
  <DeleteAccount onDeleted={() => navigate('/goodbye')}
                 onCancel={() => navigate('/settings')} />
} />
```

| Screen | Props | Behaviour |
|---|---|---|
| `ChangePassword` | `onSuccess`, `onCancel` | Shows a confirmation, then calls `onSuccess` after ~1.5s. A wrong current password leaves the session intact. |
| `DeleteAccount` | `onDeleted`, `onCancel` | Gated twice — an acknowledgement checkbox *and* a password. Clears the session only on success. |

---

## Theming

The screens are styled with CSS custom properties, so you can rebrand them
without forking or rebuilding.

**At runtime**, via the provider — applied to `<html>` on mount:

```jsx
<AuthProvider
  config={authConfig}
  theme={{
    accent: '#4f46e5',
    'accent-hover': '#4338ca',
    bg: '#fafafa',
    fg: '#111827',
  }}
>
```

Hex, `rgb(15 23 42)` and bare `15 23 42` are all accepted. Unrecognised keys
are ignored, so a typo can't inject arbitrary CSS.

**Or in your own stylesheet** (loaded after the library's):

```css
:root {
  --ac-accent: 79 70 229;      /* channels only — no rgb(), no # */
  --ac-radius: 0.375rem;
  --ac-font: "Inter", system-ui, sans-serif;
}
```

Tokens: `bg`, `surface`, `border`, `border-strong`, `fg`, `muted`, `subtle`,
`accent`, `accent-fg`, `accent-hover`, `danger`, `danger-surface`,
`danger-border`, `success`, `success-surface`, `success-border`, plus
`--ac-radius`, `--ac-radius-lg` and `--ac-font`.

`applyTheme(theme)` and `resetTheme()` are exported for imperative use.

For anything past a palette change, edit the screens in `src/auth/` — that is
what they are for.

---

## Configuration reference

Everything `createAuthClient` accepts:

| Option | Type | Default | What it does |
|---|---|---|---|
| `baseURL` | `string` | — | **Required.** Root of your auth API. Throws if missing. |
| `storage` | adapter | `localStorage`, else memory | `{ getItem, setItem, removeItem }`. |
| `storageKeys` | `object` | `{ TOKENS: 'auth_tokens', USER: 'auth_user' }` | Rename the keys — needed when two apps share an origin. |
| `endpoints` | `object` | see [contract](#backend-contract) | Override individual routes; merged over the defaults. |
| `headers` | `object` | — | Extra headers on every auth request (e.g. a tenant id). |
| `expirySkewSeconds` | `number` | `30` | Refresh this many seconds *before* expiry. |
| `crossTab` | `boolean` | `true` | Keep tabs in sync. Set `false` for tests and Node. |
| `onForceLogout` | `() => void` | — | The session died unrecoverably. Redirect here. |
| `onAuthStateChange` | `(state) => void` | — | Called on every state change — analytics, logging. |

Overriding a single route leaves the rest at their defaults:

```js
createAuthClient({
  baseURL,
  endpoints: { SIGN_IN: '/v2/auth/login', REFRESH: '/v2/auth/token/refresh' },
})
```

---

## Method reference

Everything below is available both on the client object and from `useAuth()`.

### State — from `useAuth()`

| Field | Type | Notes |
|---|---|---|
| `isAuthenticated` | `boolean` | True once a stored `id_token` exists. |
| `user` | `object \| null` | The profile the API returned at verification. |
| `idToken` | `string \| null` | Current id token. |
| `accessToken` | `string \| null` | Current access token. |
| `isLoading` | `boolean` | A method is in flight. |
| `error` | `string \| null` | Message from the last failed call. |

The refresh token is deliberately **not** on state — read it with
`getRefreshToken()` if you truly need it. It is a long-lived credential with no
business being rendered into a component tree, and `refreshToken` is already
the name of the method that renews the session.

### Session methods

Each resolves to `{ error: false, data }` or
`{ error: true, message, code?, status? }`.

| Method | Payload | Notes |
|---|---|---|
| `signUp` | `{ firstName, lastName, email \| phone, password }` | Sends a confirmation code. Does not authenticate. |
| `signIn` / `login` | `{ email \| phone, password }` | **Authenticates.** Persists the session, tells other tabs. |
| `verifyOtp` | `{ identifier, otp }` | Confirms a new account. Returns a message, **no tokens**. |
| `resendOtp` | `{ identifier, purpose }` | Resends the confirmation code; unconfirmed accounts only. |
| `forgotPassword` | `{ identifier, email \| phone }` | Sends a reset code. |
| `verifyResetOtp` | `{ identifier, otp }` | Returns `data.resetToken`. Does not authenticate. |
| `resetPassword` | `{ identifier, resetToken, newPassword }` | The reset token is single-use. |
| `changePassword` | `{ currentPassword, newPassword }` | Requires a session. A rejection keeps you signed in. |
| `deleteAccount` | `{ password }` | Clears the session **only** on success. |
| `signOut` / `logout` | — | Revokes server-side, then clears locally regardless of the outcome. |

### Token methods

| Method | Returns | Notes |
|---|---|---|
| `getValidToken()` | `Promise<string \| null>` | **Use this one.** Refreshes if expired or near expiry. |
| `getIdToken()` | `string \| null` | Raw, from storage. May be expired. |
| `getAccessToken()` | `string \| null` | Raw. |
| `getRefreshToken()` | `string \| null` | Raw. |
| `getTokens()` | `object \| null` | The whole stored bundle. |
| `refreshToken()` | `Promise<result>` | Forces a refresh now. |
| `fetchTokens()` | `Promise<result>` | Re-fetches a bundle for the current session. |
| `expiresIn()` | `number` | Seconds until the id token expires; negative once expired. |

### Lifecycle and escape hatches

| Member | Notes |
|---|---|
| `getState()` / `subscribe(fn)` | For non-React consumers. `subscribe` returns an unsubscribe function. |
| `connect()` / `disconnect()` | Attach/detach cross-tab listeners. Symmetric and repeatable; the provider pairs them. |
| `destroy()` | Permanent teardown. Only for clients you create and discard dynamically. |
| `tokenStore` | Direct storage access. |
| `__backend` | The raw backend. Tests and debugging only — not a stable API. |

Also exported for direct use: `decodeJWT(token)`, `isExpired(token, skew)`,
`secondsUntilExpiry(token)`, `normalizeTokens(input)`, `toPublicTokens(tokens)`.

```js
import { decodeJWT } from './auth'
const claims = decodeJWT(getAuthClient().getIdToken())  // null if undecodable
```

`decodeJWT` reads the payload only. **It does not verify the signature** —
never make a security decision on the client from its output. The server is
the authority.

---

## Backend contract

Every route is a `POST` under `baseURL`, JSON in and out.

| Route | Sends | Expects back |
|---|---|---|
| `/auth/signup` | profile + password | `{ message }` — a confirmation code is dispatched |
| `/auth/signin` | credentials | **the token bundle + `{ user }`** — this authenticates |
| `/auth/verify-otp` | `{ identifier, otp }` | `{ message }` — confirms the account, no tokens |
| `/auth/resend-otp` | `{ identifier, purpose }` | `{ message }` |
| `/auth/forgot-password` | `{ identifier }` | `{ message }` |
| `/auth/verify-reset-otp` | `{ identifier, otp }` | `{ resetToken, expiresIn }` |
| `/auth/reset-password` | `{ resetToken, newPassword }` | `{ message }` |
| `/auth/change-password` | `{ currentPassword, newPassword }` | `{ message }` — Bearer required |
| `/auth/delete-account` | `{ password }` | `{ message }` — Bearer required |
| `/auth/tokens` | — | `{ tokens }` — Bearer required |
| `/auth/refresh` | `{ refreshToken }` | `{ tokens }` |
| `/auth/logout` | `{ refreshToken }` | `{ message }` |

The token bundle, either at the top level or nested under `tokens`:

```json
{
  "id_token": "eyJ…",
  "access_token": "eyJ…",
  "refresh_token": "rt_…",
  "session_token": "eyJ…",
  "token_type": "Bearer",
  "expires_in": 300
}
```

`camelCase` keys (`idToken`, …) are accepted too, and any extra fields you
include are preserved across refreshes untouched.

Errors should carry a displayable `message` and a stable `code`:

```json
{ "message": "Incorrect code. 3 attempts remaining.", "code": "OTP_INVALID" }
```

The library reads `message`, `code` and the HTTP status. Codes the built-in
flows understand: `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`,
`INVALID_CREDENTIALS`, `ACCOUNT_EXISTS`, `RESET_TOKEN_INVALID`,
`CURRENT_PASSWORD_INVALID`, `REFRESH_TOKEN_INVALID`. Network failures surface
as `NETWORK_ERROR` locally.

A reference implementation of the whole contract — including OTP expiry,
attempt limits, single-use reset tokens and refresh rotation — lives in
[`scripts/test-server.mjs`](../scripts/test-server.mjs). It is the most precise
statement of what the client expects. It is a test fixture, never shipped, and
must not be used as a starting point for a production service.

---

## Framework notes

**Vite + React** — the default path. Nothing extra.

**Create React App / Webpack** — `authConfig` reads a Vite-only variable, so
build your own config with `process.env.REACT_APP_API_BASE_URL` and pass it to
the provider. See [step 3](#3-point-it-at-your-api).

**Next.js** — the client touches `localStorage` and `BroadcastChannel`, so
keep it on the client:

```jsx
'use client'
import { AuthProvider } from '../auth'
```

Use `NEXT_PUBLIC_API_BASE_URL`. On the server, storage falls back to memory
and cross-tab is inert — nothing crashes, but nothing persists either. For SSR
routes that need the session, read the token from a cookie you set yourself;
this library does not manage cookies.

**React StrictMode** — supported. The provider's `connect`/`disconnect` pair is
symmetric and repeatable specifically so the mount → cleanup → remount cycle
leaves the cross-tab channel working.

**Multiple apps on one origin** — they would share `localStorage` keys. Give
each its own:

```js
createAuthClient({ baseURL, storageKeys: { TOKENS: 'admin_tokens', USER: 'admin_user' } })
```

Note the cross-tab channel is named `auth` for all of them, so a logout in one
still reaches the other. Set `crossTab: false` if that is not what you want.

---

## Troubleshooting

**`createAuthClient requires a baseURL`** — `VITE_API_BASE_URL` is unset or the
dev server wasn't restarted after editing `.env`.

**`useAuth() must be used within an <AuthProvider>`** — the component is outside
the provider, or a second copy of the library is loaded. Check
`npm ls @7edge/auth-client`.

**The screens render unstyled** — `import '@7edge/auth-client/style.css'` is
missing at the app root. If you built a custom screen, its outermost element
also needs `className="ac-root"`.

**Nothing was scaffolded on install** — install scripts were blocked
(`--ignore-scripts`, or npm's allow-scripts prompt). Run `npx auth-client init`,
then `npx auth-client setup`. `npx auth-client status` shows what is still
missing.

**Stuck on the OTP screen after a correct sign-in** — you are on 0.2.0, which
expected an OTP round on every sign-in. Upgrade to 0.2.1+, where `signIn()`
authenticates directly. See [the user journeys](#the-user-journeys).

**Signed in but requests still 401** — you are attaching `getIdToken()` instead
of `await getValidToken()`, so an expired token goes out unrefreshed.

**Logged out unexpectedly** — a refresh failed. Refresh tokens are single-use
and rotate; two clients sharing one bundle will knock each other out. Check
that only one client instance exists (use `getAuthClient()`, don't
call `createAuthClient` twice).

**Every request triggers a refresh** — the id token's `exp` is shorter than
`expirySkewSeconds` (30s by default), so it is born inside the skew window.
Lengthen the token TTL server-side, or lower the skew.

**Two tabs fight over refreshing** — that shouldn't happen: a refresh is
broadcast and siblings adopt the new bundle. Confirm `crossTab` is not `false`
and that both tabs are on the same origin.

**CORS errors** — the API must allow your origin and the `Authorization`
header. That is a server configuration matter, not a client one.

**Session lost on reload** — storage is blocked (private-mode Safari, a strict
browser setting), so the client fell back to memory. That fallback is
deliberate: the tab still works, only persistence is lost.
