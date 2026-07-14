# auth-client

Plug-and-play frontend authentication library. Install it, call methods
like `login()` / `logout()` — no Redux, no required UI, no backend wiring
beyond a base URL.

It ships as three independent entry points, so you only pull in what you use:

| Import path        | What it gives you                                            | Requires React? |
|---------------------|---------------------------------------------------------------|------------------|
| `auth-client`        | Headless client: `signUp`, `signIn`/`login`, `verifyOtp`, `resendOtp`, `forgotPassword`, `verifyResetOtp`, `resetPassword`, `changePassword`, `deleteAccount`, `fetchTokens`, `refreshToken`, `signOut`/`logout` | No |
| `auth-client/react`  | `<AuthProvider>` + `useAuth()` reactive hook over the client   | Yes |
| `auth-client/ui`     | Prebuilt screens (`<AuthFlow>`, `<SignIn>`, ...) + `ui/style.css` | Yes |

## Install

```bash
npm install auth-client
```

## 1. Headless core — just call the methods

```js
import { createAuthClient } from 'auth-client'

const auth = createAuthClient({ baseURL: 'https://api.example.com/api' })

const result = await auth.login({ email, password }) // sends OTP
if (!result.error) {
  await auth.verifyOtp({ identifier: email, otp: '123456' }) // completes sign-in
}

auth.getState() // { isAuthenticated, user, idToken, refreshToken, isLoading, error }
const unsubscribe = auth.subscribe((state) => console.log(state))

await auth.logout()
```

Every method returns `{ error: false, data }` or `{ error: true, message, status }` —
no try/catch required. A 401 from any request automatically triggers one
silent token refresh and retry; if that refresh fails, `onForceLogout` fires.

### Config

```js
createAuthClient({
  baseURL: 'https://api.example.com/api',
  useMock: false,       // swap in an in-memory mock backend (demos/tests, no network)
  storage: myAdapter,   // { getItem, setItem, removeItem } — defaults to localStorage, falls back to in-memory for SSR
  storageKeys: { ID_TOKEN: 'myapp_id_token' }, // override default storage key names
  onForceLogout: () => { /* refresh failed — session is gone */ },
})
```

## 2. React hook — reactive state, same methods

```jsx
import { AuthProvider, useAuth } from 'auth-client/react'

function Root() {
  return (
    <AuthProvider config={{ baseURL: 'https://api.example.com/api' }}>
      <App />
    </AuthProvider>
  )
}

function App() {
  const { isAuthenticated, user, login, logout } = useAuth()
  if (!isAuthenticated) return <button onClick={() => login({ email, password })}>Sign in</button>
  return <button onClick={logout}>Log out, {user.name}</button>
}
```

Pass an existing client instead of `config` if you built one outside React
(`<AuthProvider client={auth}>`) — useful for sharing it with non-React code.

## 3. Prebuilt UI — drop-in screens

```jsx
import { AuthProvider, useAuth } from 'auth-client/react'
import { AuthFlow } from 'auth-client/ui'
import 'auth-client/ui/style.css'

function App() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <AuthFlow />
  return <Dashboard />
}
```

`<AuthFlow>` covers the full pre-auth journey: sign up, sign in, OTP
verification, forgot/reset password. `ChangePassword` and `DeleteAccount`
are exported separately since they belong in an already-authenticated area
of your app (e.g. an account settings page) — render them yourself with
`onSuccess`/`onCancel`/`onDeleted` callbacks:

```jsx
import { ChangePassword, DeleteAccount } from 'auth-client/ui'

<ChangePassword onSuccess={() => navigate('/settings')} onCancel={() => navigate('/settings')} />
<DeleteAccount onDeleted={() => navigate('/')} onCancel={() => navigate('/settings')} />
```

All primitives (`Button`, `FormField`, `PasswordField`, `IdentifierInput`,
`AuthCard`, `LoadingSpinner`) are also exported individually if you'd rather
compose your own screens around `useAuth()`.

### Styling

`auth-client/ui/style.css` is a precompiled Tailwind bundle — you do **not**
need Tailwind installed to use it. It includes Tailwind's base reset
(Preflight), so import it once near your app root, not scoped inside a
component tree that already has its own CSS reset. The primary color
(`#667eea` → `#764ba2` gradient) is currently fixed at build time; theming
via CSS variables is a natural follow-up if you need to brand it.

## Backend contract

The HTTP backend expects these endpoints under `baseURL` (see
`src/core/constants.js` for exact paths): `/auth/signup`, `/auth/signin`,
`/auth/verify-otp`, `/auth/resend-otp`, `/auth/forgot-password`,
`/auth/verify-reset-otp`, `/auth/reset-password`, `/auth/change-password`,
`/auth/delete-account`, `/auth/tokens`, `/auth/refresh`, `/auth/logout`.

TOTP is not implemented yet — sign-in/sign-up currently complete via
one-time-passcode (email/phone) only.

## Build

```bash
npm install
npm run build   # vite build (core/react/ui bundles) + tailwind CSS build
```
