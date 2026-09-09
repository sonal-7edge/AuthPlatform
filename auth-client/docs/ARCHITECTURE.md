# Architecture & maintainer guide

For whoever maintains `@7edge/auth-client` next. It explains how the pieces fit
together, the reasoning behind the decisions that aren't obvious from reading a
single file, and how to change things without breaking consumers.

If you are *using* the library, read [INTEGRATION.md](./INTEGRATION.md) instead.
For a plain-language folder map, see [../STRUCTURE.md](../STRUCTURE.md).

- [Design principles](#design-principles)
- [The layer cake](#the-layer-cake)
- [Module map](#module-map)
- [Key logic 1 — the token lifecycle](#key-logic-1--the-token-lifecycle)
- [Key logic 2 — the single-flight refresh lock](#key-logic-2--the-single-flight-refresh-lock)
- [Key logic 3 — the two interceptors](#key-logic-3--the-two-interceptors)
- [Key logic 4 — storage as one atomic bundle](#key-logic-4--storage-as-one-atomic-bundle)
- [Key logic 5 — cross-tab coordination](#key-logic-5--cross-tab-coordination)
- [Key logic 6 — the state store](#key-logic-6--the-state-store)
- [Key logic 7 — errors never throw](#key-logic-7--errors-never-throw)
- [Key logic 8 — the circular wiring](#key-logic-8--the-circular-wiring)
- [The React layer](#the-react-layer)
- [The UI layer](#the-ui-layer)
- [The scaffolding pipeline](#the-scaffolding-pipeline)
- [Build and packaging](#build-and-packaging)
- [Verification](#verification)
- [Making changes](#making-changes)
- [Known limitations](#known-limitations)

---

## Design principles

Five rules explain most of what you'll find. When in doubt, keep them.

1. **The core knows nothing about React.** `src/core/` would run unchanged in
   Node. This is what makes Path C (headless) work and what keeps the core
   testable without a DOM.
2. **Nothing throws.** Every public method resolves to
   `{ error, message?, code?, data? }`. Consumers branch, they don't
   `try`/`catch`. See [key logic 7](#key-logic-7--errors-never-throw).
3. **The transport is pluggable.** `tokenManager` is handed a `requestRefresh`
   function and never imports axios; `tokenStore` is handed a storage adapter
   and never touches `localStorage` directly. Both are swappable and both are
   test seams.
4. **The screens belong to the consumer.** They are ejected into the host
   project as editable files, and *generated* from `src/ui/` so they can't
   drift. Nobody should ever fork this package to restyle a button.
5. **Degrade, don't crash.** Blocked storage falls back to memory. No
   `BroadcastChannel` falls back to `storage` events. A failed broadcast is
   swallowed. The one exception is a missing `baseURL`, which throws loudly —
   see [making changes](#making-changes).

---

## The layer cake

```
┌───────────────────────────────────────────────────────┐
│  src/ui/          screens + primitives + theming      │  React, opinionated
│                   AuthFlow orchestrates the journey   │
├───────────────────────────────────────────────────────┤
│  src/react/       AuthProvider (context + lifecycle)  │  React, thin
│                   useAuth   (useSyncExternalStore)    │
├───────────────────────────────────────────────────────┤
│  src/core/        createAuthClient — the facade       │  no React at all
│    tokenManager   refresh policy + single-flight lock │
│    httpClient     axios instance + both interceptors  │
│    storage        token store, normalisation          │
│    broadcast      cross-tab bus                       │
│    backends/      route → method mapping              │
│    jwt            decode / expiry only                │
└───────────────────────────────────────────────────────┘
```

Dependencies point strictly downward. `src/core/` importing from `src/react/`
or `src/ui/` would break the React-free `core` subpath — the one hard rule of
the layout.

One deliberate exception: `react/AuthProvider.jsx` imports `applyTheme` from
`ui/theme.js`, so a theme can be handed to the provider. `theme.js` has no
React import, so this doesn't drag the UI layer into the React bundle.

---

## Module map

| File | Responsibility | Watch out for |
|---|---|---|
| `core/createAuthClient.js` | The facade. Owns state, wires everything, exposes the public API. | The [circular wiring](#key-logic-8--the-circular-wiring) with the backend. |
| `core/tokenManager.js` | *When* to refresh and how to serialise refreshes. | The `bypassExpiryCheck` flag; the lock must always be released. |
| `core/httpClient.js` | The axios instance and its two interceptors. | `skipsAuthRefresh` prevents infinite recursion. |
| `core/storage.js` | Persistence, plus normalising every token shape the API might return. | `saveTokens` **merges**, deliberately. |
| `core/broadcast.js` | Cross-tab messaging, with a `storage`-event fallback. | `open`/`close` must stay symmetric for StrictMode. |
| `core/backends/httpBackend.js` | Maps named methods onto routes. | The seam where an alternative transport plugs in. |
| `core/jwt.js` | Decode a payload; compute expiry. Nothing else. | Signature is **never** verified here. |
| `core/handleErrorResponse.js` | Normalises axios errors into the result shape. | The only place error shape is decided. |
| `core/constants.js` | Routes, storage keys, enums, the 30s skew. | Changing a value here is a breaking change. |
| `react/AuthProvider.jsx` | Puts one client in context; manages connect/disconnect. | Client is created once; `config` changes are ignored. |
| `react/useAuth.js` | `useSyncExternalStore` over the client, plus bound methods. | Methods are stable identities — safe in dep arrays. |
| `ui/AuthFlow.jsx` | Pre-auth screen router and shared flow state. | Post-auth screens intentionally excluded. |
| `ui/theme.js` | Tokens → CSS custom properties. | Only known keys are applied. |
| `ui/validation.js` | Client-side validation. Advisory only. | The server remains the authority. |

---

## Key logic 1 — the token lifecycle

Three tokens are persisted:

| Token | Used for | Lifetime |
|---|---|---|
| `id_token` | The `Authorization: Bearer` header on every authenticated request. | Short (minutes) |
| `access_token` | Carried for consumers who need it; the library itself sends the id token. | Short |
| `refresh_token` | Minting a new bundle. Single-use — the server rotates it. | Long (days) |

`session_token` and any other field the platform adds ride along untouched
(see [key logic 4](#key-logic-4--storage-as-one-atomic-bundle)).

The refresh decision lives in one place — `isExpired(token, skew)` in
`core/jwt.js`:

```
                exp - 30s        exp
   ────────────────┼──────────────┼──────────────►  time
     "fresh"       │  skew window │   expired
   use as-is       │  refresh now │  refresh now
```

The 30-second skew (`DEFAULT_EXPIRY_SKEW_SECONDS`) exists so a request that is
*about* to be sent can't be overtaken by expiry in flight, and so a modest
client-clock error doesn't produce a 401. It matches the ORDO host app's value;
keep them aligned unless you change both.

A token with no `exp` claim reports `Infinity` seconds remaining and is never
refreshed proactively — the 401 path is the only safety net for it.

**Refresh is triggered from three places:**

1. The request interceptor, before every authenticated call
   (`getValidToken()`).
2. The response interceptor, on a 401 that slipped through
   (`refresh(true)`).
3. Explicitly, via `client.refreshToken()` — also `refresh(true)`.

All three route through the same manager, so all three share the lock.

---

## Key logic 2 — the single-flight refresh lock

The most important invariant in the library: **N concurrent callers produce
exactly one network refresh.**

Without it, ten parallel requests hitting an expired token would fire ten
refreshes. Nine would present an already-rotated (now invalid) refresh token,
fail, and force a logout on a session that was perfectly healthy.

The implementation is a boolean and a queue, in `core/tokenManager.js`:

```js
if (isRefreshing) {
  return new Promise((resolve, reject) => pendingQueue.push({ resolve, reject }))
}
isRefreshing = true
// … one network round-trip …
flushQueue(null, newIdToken)   // everyone waiting resolves with the same token
```

```
caller A ──► lock acquired ──► POST /auth/refresh ──┐
caller B ──► queued ─────────────────────────────┐  │
caller C ──► queued ─────────────────────────────┤  │
                                                 ▼  ▼
                                       all three resolve with one token
```

Two rules when touching this code:

- **Every exit path must release the lock and flush the queue.** A `return` or
  a `throw` that skips `flushQueue` deadlocks every queued caller forever —
  they hold promises nobody will ever settle. The `catch` block is what makes
  failure safe: it resets the flag, rejects the queue, broadcasts a logout, and
  rethrows.
- **`bypassExpiryCheck` is not optional decoration.** With it `false`, the
  manager re-reads storage first and returns the stored token if it still looks
  valid — the fast path for "another tab already refreshed while we waited."
  The 401 interceptor passes `true` because the *server* has rejected the
  token; a locally-valid `exp` (clock skew, server-side revocation) must not
  talk us out of refreshing. Getting this backwards produces an infinite
  401 → "looks fine" → 401 loop.

`getValidToken()` deliberately swallows a refresh failure and returns `null`
rather than throwing. Throwing from inside the request interceptor would
produce an opaque axios error; returning `null` lets the request go out bare
and fail with a real 401, which the response interceptor and your error
handling already understand. The logout has already been broadcast by then.

---

## Key logic 3 — the two interceptors

`core/httpClient.js` creates a **dedicated** axios instance, never the global
`axios` object, so two clients can coexist without their interceptors
colliding.

**Request interceptor — be valid before you're sent:**

```js
const token = (await tokenManager.getValidToken()) ?? tokenStore.getIdToken()
if (token) config.headers.Authorization = `Bearer ${token}`
```

The `??` fallback matters: if the refresh failed, we still send whatever we
have rather than sending nothing. The response interceptor is the safety net.

**Response interceptor — recover from a 401 once:**

```js
if (!originalRequest || !is401 || isRetry || isRefreshCall) reject
originalRequest._retry = true
const newToken = await tokenManager.refresh(true)   // bypass — server said no
return instance(originalRequest)                    // replay with the new token
```

The `_retry` flag caps it at exactly one attempt per request. Without it, a
persistently-401ing endpoint would loop forever.

**`skipsAuthRefresh(url)` guards two cases:**

- The refresh route itself. Refreshing before a refresh recurses infinitely.
- S3 pre-signed URLs (`X-Amz-Signature`, `X-Amz-Algorithm`). They already carry
  AWS auth in the query string, and adding an `Authorization` header makes AWS
  reject with *"Only one auth mechanism allowed."*

If you add another route that must never carry a Bearer token, add it here —
not with a special case at the call site.

---

## Key logic 4 — storage as one atomic bundle

Tokens are persisted as **one JSON blob** under `auth_tokens`, not one key per
token:

```json
{ "id_token": "…", "access_token": "…", "refresh_token": "…",
  "session_token": "…", "token_type": "Bearer", "expires_in": 300 }
```

One write means there is never a window where a fresh `id_token` sits next to a
stale `refresh_token`. Separate keys would make that window real and
occasionally fatal.

Three behaviours in `core/storage.js` are load-bearing:

**`saveTokens` merges rather than replaces.** A refresh response that returns
only a new `id_token` must not wipe the `refresh_token`:

```js
const merged = { ...(readJSON(KEYS.TOKENS) || {}), ...incoming }
```

**`normalizeTokens` accepts every shape the platform might send** — snake_case,
camelCase, or nested under `data` — and canonicalises to snake_case. Unknown
fields are preserved untouched, so a platform that starts returning an extra
claim keeps it across refreshes with no code change here.

**The user is stored separately**, under `auth_user`. `persistSession()` in
`createAuthClient` splits the API's response before saving. If the user object
lived inside the token blob, the merge above would carry a stale copy forward
through every subsequent refresh, forever. There is a regression test for
exactly this.

Storage resolution: a caller-supplied adapter wins; otherwise `localStorage`,
*probed with a real write* because private-mode Safari exposes the API and then
throws on use; otherwise an in-memory `Map`. Reads and writes are individually
wrapped in `try`/`catch` — a quota error degrades persistence, it does not
break the tab.

---

## Key logic 5 — cross-tab coordination

Four message types on the `auth` `BroadcastChannel` — a name shared with the
ORDO host app so both sit on one bus:

| Message | Sent when | Receivers do |
|---|---|---|
| `token_refreshed` | after every successful refresh | adopt the broadcast bundle, re-read state |
| `logout` | sign-out, account deletion, unrecoverable refresh failure | clear the session, fire `onForceLogout` |
| `login` | OTP verification succeeded | re-read state from storage |
| `need_refresh` | a sibling hit a 401 and wants the lock holder to renew | refresh, unless already refreshing |

`token_refreshed` carries the bundle as its payload, so a sibling adopts it
instead of racing its own refresh against a token that has already rotated.

**The fallback.** Browsers without `BroadcastChannel` (older Safari, some
embedded webviews) get `storage` events instead: writing a timestamp to a
sentinel key fires `storage` in *other* tabs only — exactly the semantics
wanted. It can't carry a payload, so receivers re-read storage themselves; the
message is flagged `viaFallback: true`. The handler ignores events with
`newValue === null`, because `localStorage.clear()` fires one per key.

**`open()`/`close()` are symmetric and repeatable, and this is not cosmetic.**
The provider pairs them as mount/cleanup. React StrictMode deliberately mounts,
cleans up, and remounts — a one-way teardown would leave the channel dead for
the rest of the session, and cross-tab sync would silently stop working in
development only. Subscribers are kept in a `Set` that outlives the transport,
so `open()` after `close()` fully restores. `destroy()` is the one-way door.

Broadcasting is best-effort throughout: `post` never throws.

---

## Key logic 6 — the state store

`createAuthClient` implements a minimal observable store — no Redux, no
Zustand, no dependency:

```js
let state = snapshot()
const listeners = new Set()

function setState(patch) {
  const changed = Object.keys(patch).some((key) => state[key] !== patch[key])
  if (!changed) return                        // no-op patches don't re-render
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
  onAuthStateChange?.(state)
}
```

The equality bail-out is what makes it safe to feed
`useSyncExternalStore`: without it, a patch with identical values would produce
a new object identity and re-render every consumer for nothing.

`state` is replaced, never mutated — `useSyncExternalStore` compares by
reference.

**`runAction`** wraps every public method so `isLoading` and `error` transition
identically everywhere, and so a backend that *throws* instead of resolving is
normalised back into the `{ error }` contract before it reaches a caller. If
you add a method, wrap it — don't hand-roll the state transitions.

The initial snapshot is read synchronously from storage at construction, which
is why a page reload renders authenticated on the first frame rather than
flashing the login screen.

---

## Key logic 7 — errors never throw

`handleErrorResponse` collapses every axios failure into one shape:

| Situation | Result |
|---|---|
| Server responded | `{ error: true, message, status, code }` — `message`/`code` from the body |
| Request sent, no response | `{ error: true, message: 'Could not reach the server…', code: 'NETWORK_ERROR' }` |
| Anything else | `{ error: true, message, code: 'UNKNOWN' }` |

`runAction` adds `code: 'UNEXPECTED'` for a backend that throws outright.

This is a public contract. Consumers branch on `result.error` and display
`result.message`. Changing the shape, or letting an exception escape a public
method, breaks every consumer at once.

The exceptions to "nothing throws" are all *construction-time programmer
errors*, not runtime conditions: a missing `baseURL`, and `useAuth()` outside a
provider. Those should throw, immediately and with a message that says how to
fix it.

---

## Key logic 8 — the circular wiring

Worth understanding before you rearrange `createAuthClient`:

```
tokenManager ──refreshes through──► backend
     ▲                                 │
     └────interceptor refreshes────────┘
```

The token manager refreshes *through* the backend; the backend's interceptor
refreshes *through* the manager. Genuinely circular, and resolved with a
deliberate forward declaration:

```js
let backend                                    // declared, not yet assigned

const tokenManager = createTokenManager({
  requestRefresh: (payload) => backend.refreshToken(payload),   // deferred
  …
})

backend = createHttpBackend(createHttpClient({ …, tokenManager }), { endpoints })
```

`requestRefresh` only dereferences `backend` when a refresh actually runs — long
after both exist. Reordering these two statements, or converting `backend` to a
`const` initialised earlier, breaks the wiring. The comment above them says so;
leave it there.

---

## The React layer

Two files, deliberately thin.

**`AuthProvider`** creates or accepts a client, keeps it in `useState`'s lazy
initialiser so it is created exactly once, and pairs `connect`/`disconnect` in
an effect. It calls `disconnect()`, *not* `destroy()` — destroying on StrictMode's
first simulated unmount would kill the channel permanently.

The theme effect keys on `JSON.stringify(theme)` rather than the object
identity, so a fresh-but-equal literal in the parent's render doesn't re-apply
tokens on every render.

**`useAuth`** is `useSyncExternalStore(client.subscribe, client.getState,
client.getState)` — the same function for client and server snapshots, since
the store is already SSR-safe (memory storage yields a consistent unauthenticated
snapshot).

It spreads state and re-exports the client's methods. Those methods are stable
identities owned by the client, so they are safe in dependency arrays without
memoisation. Keep that property: wrapping one in a `useCallback` here, or
recreating it per render, would break consumers' effects.

---

## The UI layer

**`AuthFlow`** is a switch over one piece of flow state:

```js
{ screen, pendingIdentifier, identifierType, otpPurpose, resetToken }
```

Screens receive `{ flow, setFlow, onAuthenticated }` and advance the journey by
patching. `OtpVerify` serves both the auth and password-reset paths, branching
on `otpPurpose` to call `verifyOtp` or `verifyResetOtp`.

`ChangePassword` and `DeleteAccount` are excluded on purpose — they require an
existing session and belong in the host's own routes.

**Styling** is Tailwind compiled to a standalone stylesheet, with two decisions
worth preserving:

- **Preflight is disabled.** The stylesheet ships into host apps, and a global
  reset would silently restyle *their* pages. `styles.css` reproduces only the
  parts the utilities depend on, scoped to `.ac-root`.
- **Every scoped-reset rule is wrapped in `:where()`**, contributing zero
  specificity — what Preflight gets from bare element selectors. Without it,
  `.ac-root button` (0,1,1) outranks `.bg-ac-accent` (0,1,0) and strips the
  styling off every button in the library. If you add a reset rule, wrap it.

**Theme tokens are RGB channel triplets, not hex**, because Tailwind composes
them as `rgb(var(--ac-accent) / <alpha-value>)` — which is what makes
`ring-ac-accent/10` work against a CSS variable. Defaults live in CSS, not JS,
so the palette applies before React hydrates. `applyTheme` accepts hex, `rgb()`
or bare channels, converts, and applies **only recognised keys** so a typo can't
inject arbitrary properties.

**Validation** in `ui/validation.js` is deliberately permissive — the field's
job is catching typos before a round-trip, not adjudicating whether an address
is real. The server is the authority. Don't tighten these patterns in the hope
of doing security here.

---

## The scaffolding pipeline

How a consumer ends up with editable screens:

```
src/ui/screens/*.jsx
        │  scripts/build-templates.mjs  (rewrites imports, adds a banner)
        ▼
dist/templates/screens/*.jsx  +  templates/{config.js,index.js,env} copied verbatim
        │  bin/scaffold.mjs  (invoked by postinstall, or `auth-client init`)
        ▼
consumer's src/auth/
```

**The screens are generated, not hand-maintained.** That is the point: an
ejected copy can never silently drift from the library it talks to. The only
transformation is rewriting internal relative imports to the package's public
entry — `import AuthCard from '../components/AuthCard'` becomes a named import
from `@7edge/auth-client`, since default exports inside the library are named
exports on the barrel. `AuthFlow` is special-cased to keep its `./screens/*`
imports relative, so the ejected flow drives the ejected screens.

If you add a screen to `src/ui/screens/`, add its name to the `SCREENS` array
in `build-templates.mjs` and export it from `templates/index.js`. Nothing else.

**`bin/scaffold.mjs`** holds two rules absolutely:

- **Never overwrite.** Existing files are reported as skipped unless `--force`;
  an existing `VITE_API_BASE_URL` is left alone even then. Reinstalling and
  upgrading must be safe for someone who has edited their screens.
- **Resolve the templates by looking for them**, not by assuming a depth — the
  same file runs from `bin/` in the source tree and `dist/bin/` in the
  published repo.

**`bin/postinstall.mjs`** never fails an install. Every error is caught and
reported as a suggestion to run `npx auth-client init`. It no-ops silently when
there is nothing to scaffold into: no `INIT_CWD`, our own dev install, a
transitive install (the "project" is itself inside `node_modules`), or no
`package.json`. `AUTH_CLIENT_DEBUG=1` makes the skips verbose.

Breaking either rule turns a routine `npm install` into a support ticket.

---

## Build and packaging

```bash
npm run build          # js + css + templates + bin, in that order
npm run build:js       # vite → dist/{index,core/index,react/index,ui/index}.{js,cjs}
npm run build:css      # tailwind → dist/style.css
npm run build:templates
npm run lint
npm run verify         # the real test suite — see below
```

**Four entry points, one real one.** `index` is the single entry everything is
exported from. `core`, `react` and `ui` remain as subpaths for back-compat, and
`core` is the one that genuinely matters — it carries no React import anywhere
in its graph.

**`react`, `react-dom`, `react/jsx-runtime` and `axios` are external.** Bundling
React would produce a second copy and break hooks in every consumer. Do not
remove them from `rollupOptions.external`.

**`sideEffects: ["**/*.css"]`** keeps tree-shaking working while ensuring the
stylesheet import is never dropped.

**`files: ["dist", "bin", "README.md"]`** — `scripts/`, including the test
server, is never published. Keep it that way.

Only `dist/`, `bin/`, `src/`, `templates/` and `scripts/` are meaningful.
`dist/` is written by the build; anything typed there is gone on the next
`npm run build`. Note the trap: `templates/env` is the source, and
`dist/templates/env` is a build artifact with the same name.

Release mechanics — the two-repository split, the publish flow, retargeting the
GitHub owner — are documented under **Maintaining** in
[../README.md](../README.md).

---

## Verification

`npm run verify` runs `scripts/verify-package.mjs`: ~31 assertions covering the
package surface, the full journeys, token handling, cross-tab behaviour,
storage and error paths.

Two things make it worth more than a typical unit suite, and both should be
preserved:

**It imports from `./dist`, not `./src`** — the exact artifact a consumer
installs. A broken build, a missing export or a malformed `exports` map fails
here rather than in someone's app. Run `npm run build` first.

**It runs against a real HTTP server** (`scripts/test-server.mjs`), not an
in-process fake. That exercises axios, both interceptors, the real `Bearer`
header and genuine 401 responses — none of which a stub can reach. The server
enforces what a real service would: OTP expiry and attempt limits, single-use
reset tokens, refresh-token rotation, session revocation on password change.
It also has test affordances: `expireNext(url)` forces a single 401 to drive the
retry path, `sawBearer(url)` asserts which routes carry a header, and
`counts.refresh` proves the single-flight lock holds.

There is deliberately **no mock backend in the library**, and a test asserts
`createMockBackend` is not exported. Don't reintroduce one — a mock that drifts
from the contract is worse than no mock.

Add a case to `verify-package.mjs` for every behavioural change. The invariants
most worth guarding: exactly one refresh under concurrency, the user never
inside the token blob, a partial refresh keeping the refresh token, a failed
`deleteAccount` or `changePassword` leaving the session intact, and a session
surviving a simulated reload.

---

## Making changes

**Adding a client method**

1. Add the route to `AUTH_ENDPOINTS` in `core/constants.js`.
2. Add the method to `core/backends/httpBackend.js`.
3. Add it to `createAuthClient`, wrapped in `runAction`.
4. Re-export it from `react/useAuth.js`.
5. Add it to the required-methods list in `verify-package.mjs`, and add a
   behavioural test.
6. Document it in [INTEGRATION.md](./INTEGRATION.md).

**Adding a screen** — create it in `src/ui/screens/`, export it from
`ui/index.js`, add it to `SCREENS` in `build-templates.mjs` and to
`templates/index.js`. If it is pre-auth, add a case to `AuthFlow` and a key to
`AUTH_SCREENS`.

**Adding a theme token** — it must be added in three places or it won't work:
`ui/theme.js` (`DEFAULT_THEME`), `styles.css` (the `:root` default), and
`tailwind.config.js` (the `ac` colour map). `applyTheme` ignores any key absent
from `DEFAULT_THEME`.

**Supporting a non-HTTP transport** — implement the method shape of
`httpBackend` and pass it in. This is why `tokenManager` takes `requestRefresh`
as a function and backend methods take an unused `context` argument.

**Things that are breaking changes**, even though they look like tweaks: any
value in `core/constants.js`, the result-object shape, the storage key names or
blob layout, the broadcast message types, the `exports` map, and whether a
method throws.

---

## Known limitations

Be aware of these before promising behaviour that isn't there.

- **Tokens live in `localStorage`**, which is readable by any script on the
  origin — the standard XSS exposure. It is a deliberate trade for the SPA
  reload experience. An `httpOnly`-cookie deployment would need a different
  storage strategy and server-side cooperation; the pluggable adapter is where
  that work would start.
- **No token verification client-side.** `decodeJWT` reads claims and nothing
  more. Never make a security decision from its output.
- **No SSR session.** Under Next.js the client falls back to memory storage on
  the server; nothing crashes, but the session doesn't exist there. Cookie
  handling is the host's job.
- **One `BroadcastChannel` name (`auth`) for every client on an origin.** Two
  apps sharing an origin with different storage keys will still see each
  other's logouts. `crossTab: false` is the only current opt-out; a
  configurable channel name would be the fix.
- **No automatic background refresh timer.** Refresh happens on demand — before
  a request, or after a 401. A tab left idle past expiry refreshes on its next
  request, not before.
- **No TypeScript declarations.** The package is JSDoc-annotated JavaScript;
  consumers get inference from JSDoc but no `.d.ts`. Generating them is the
  most-requested plausible next step.
- **`validation.js` is advisory.** It catches typos, nothing more.
