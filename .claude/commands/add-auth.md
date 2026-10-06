---
description: Add AuthPlatform authentication (@7edge/auth-client) to this application
argument-hint: "[api-base-url]"
allowed-tools: Read, Glob, Grep, Edit, Write, WebFetch, Bash(npm install*), Bash(npm ls*), Bash(npx auth-client*), Bash(node -v), Bash(cat*), Bash(ls*), Bash(rm -f src/App.css src/index.css)
---

Wire AuthPlatform authentication into the application in the current working
directory.

API base URL, if the user supplied one: $1

## Reference documentation

Read the docs before acting — prefer them over anything you remember about this
package, which changes often.

**After installing, the package ships its own full documentation into this
project.** That is the primary source and it is always present:

```
node_modules/@7edge/auth-client/README.md
```

It covers the setup commands, the API surface, the screens, theming, the
backend contract and troubleshooting. Read it once the install step is done.

`src/auth/NEXT-STEPS.txt` also appears after install and lists exactly what is
still outstanding for this project.

The longer-form guides live in the public AuthPlatform repo. Fetch the frontend
one before you start — it is the most complete reference and covers cases this
command does not:

```
https://raw.githubusercontent.com/sonal-7edge/AuthPlatform/feature/CNE-440-publish-and-validate-deployment-and-integration-documentation/auth-client/docs/INTEGRATION.md
```

The whole-platform guide, if you need steps 1–2 context:

```
https://raw.githubusercontent.com/sonal-7edge/AuthPlatform/feature/CNE-440-publish-and-validate-deployment-and-integration-documentation/docs/GETTING-STARTED.md
```

Those point at the `feature/CNE-440-…` branch because that is where the docs
live today. **Once it merges, swap the branch segment for `main`** — shorter and
stable. If a URL 404s, try `main`; the merge has probably happened.

If the fetch fails for any other reason (no network, WebFetch unavailable),
**carry on without it** — the procedure below is self-contained, and the shipped
README covers the rest once step 2 finishes.

Prefer a local checkout if the repo happens to sit nearby: it is faster and
reflects uncommitted work.

## What you are doing

This command covers **step 3 only** — the frontend. It assumes a deployed auth
API already exists. Steps 1 and 2 (provisioning Cognito with `auth-cli`,
deploying the backend) are separate, documented in GETTING-STARTED.md, and are
**not** your job here unless the user explicitly asks.

## Procedure

### 1. Survey before changing anything

- Confirm this is a React app: read `package.json` for `react` and the bundler
  (Vite / CRA / Next).
- Check Node is 20+ (`node -v`).
- Check whether auth is already installed (`npm ls @7edge/auth-client`, or look
  for `src/auth/`). If it is, report what is there and ask before re-running —
  `npx auth-client init --force` overwrites edited screens.

Report what you found before installing.

### 2. Install

```bash
npm install github:Nishan666/auth-client
```

The package is **not published to npm** — `npm install @7edge/auth-client`
fails with a 404. `@7edge/auth-client` is only the name you import by.

Installing scaffolds `src/auth/` and deliberately touches nothing else.

### 3. Finish the wiring

```bash
npx auth-client setup
```

This prompts before touching `.env`, `src/main.jsx` and `src/App.jsx`, keeping
`.bak` copies. It is interactive — if it cannot prompt in this environment, run
the steps individually (`npx auth-client env`, `npx auth-client wire`) or apply
the wiring by hand from INTEGRATION.md, and tell the user which you did.

Use `npx auth-client status` to see what is outstanding, `npx auth-client undo`
to revert the app-file changes.

### 4. Set the base URL

`setup` writes a **placeholder**, not a working URL:

```
VITE_API_BASE_URL=https://REPLACE-ME.execute-api.<region>.amazonaws.com/v1
```

- If the user passed an API URL as `$1`, write it into `.env` now.
- Otherwise **stop and ask** for it. Do not invent a URL, and do not leave
  `REPLACE-ME` in place silently — it produces a runtime network error, not a
  build error, so it is easy to miss.

Vite reads `.env` only at startup, so the dev server must be restarted after
this changes.

### 5. Tidy up

On a fresh Vite app, `src/App.css` and `src/index.css` are left orphaned — the
generated files import `@7edge/auth-client/style.css` and `src/auth/home.css`
instead. Remove them only if nothing else imports them (check first).

Delete `src/auth/NEXT-STEPS.txt` once setup is complete.

### Fallback — wiring by hand

If `npx auth-client setup` cannot prompt (non-interactive shell, CI), or the
user declines the wiring step, write these two files yourself. This is what
`setup` would have produced:

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@7edge/auth-client/style.css'   // once, at the app root
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)
```

```jsx
// src/App.jsx
import { AuthProvider, useAuth, AuthFlow, authConfig } from './auth'

function Dashboard() {
  const { user, logout } = useAuth()
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1>Signed in as {user?.email}</h1>
      <button onClick={logout}>Log out</button>
    </div>
  )
}

// Split out from App: a component cannot read a context its own parent renders.
function Root() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Dashboard /> : <AuthFlow />
}

export default function App() {
  return (
    <AuthProvider config={authConfig}>
      <Root />
    </AuthProvider>
  )
}
```

Back up anything you overwrite, and tell the user you wired it manually.

`authConfig` comes from the package via the `./auth` barrel and reads
`VITE_API_BASE_URL` — there is no config file to create. On a non-Vite bundler
that variable does not exist, so build the config object yourself with the
right env var (`REACT_APP_…`, `NEXT_PUBLIC_…`) and pass it to `AuthProvider`.

## Things that will bite you

Verify these rather than assuming — they are the mistakes this command exists
to prevent:

- **Sign-in does not send an OTP.** A code is emailed once, at sign-up;
  `verifyOtp()` confirms the account and returns no tokens. `signIn()` is what
  authenticates. If you are writing custom screens, do not build an OTP step
  into sign-in.
- **Version pairing.** auth-client 0.2.0 expected an OTP on every sign-in and
  strands users on the OTP screen against the current backend. Confirm 0.2.1+
  with `npm ls @7edge/auth-client`.
- **Reinstalling does not upgrade.** npm prints `up to date` and runs nothing,
  `--force` included. To re-pull: `npm uninstall @7edge/auth-client` then
  install again.
- **Everything in `src/auth/` belongs to the user.** Never overwrite an edited
  screen without asking. Upgrades do not touch it.
- **Use `await getValidToken()`**, never `getIdToken()`, when attaching a token
  to a request — the latter returns whatever is in storage, expired or not.

## When you are done

Report concisely:

1. What changed on disk (files created, modified, backed up).
2. The installed version.
3. Whether `VITE_API_BASE_URL` is set to a real URL or still a placeholder.
4. The next command for the user to run (`npm run dev`), and what they should
   see — the sign-in screen.

If anything was skipped or a prompt could not be answered, say so explicitly
rather than reporting success.
