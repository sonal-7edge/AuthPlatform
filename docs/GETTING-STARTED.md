# Getting started — Cognito to working login

The platform is three installable pieces. This guide runs all three in order,
from an empty folder to a React app with working sign-up and sign-in.

| # | Piece | Package | What it gives you |
|---|---|---|---|
| 1 | **CLI** | `@akhileshb/auth-cli` | Provisions the Cognito User Pool + app client |
| 2 | **Backend** | `@gprasad/auth-backend` | Lambda handlers + SAM template for the auth API |
| 3 | **Frontend** | `@7edge/auth-client` | React screens, hooks and token handling |

```
  auth generate ──► cognito-template.yaml ──► sam deploy
                                                   │
                                     UserPoolId, ClientId, ClientSecret
                                                   │
                                                   ▼
  npm i @gprasad/auth-backend ──► auth/ handlers ──► sam deploy ──► API URL
                                                                       │
                                                                       ▼
  npm i @7edge/auth-client ──► src/auth/ screens ──► VITE_API_BASE_URL
```

> **Use `@7edge/auth-client` 0.2.1 or newer.** 0.2.0 expected an OTP round on
> every sign-in, which this backend does not do — pairing them leaves users
> stranded on the OTP screen. See [sign-in has no OTP](#sign-in-has-no-otp).

- [Prerequisites](#prerequisites)
- [Step 1 — provision Cognito](#step-1--provision-cognito)
- [Step 2 — deploy the auth API](#step-2--deploy-the-auth-api)
- [Step 3 — frontend](#step-3--frontend)
- [Sign-in has no OTP](#sign-in-has-no-otp)
- [End-to-end test](#end-to-end-test)
- [Wizard answers explained](#wizard-answers-explained)
- [Troubleshooting](#troubleshooting)
- [Teardown](#teardown)

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node | 18+ (20+ recommended) | `node -v` |
| AWS CLI | v2 | `aws --version` |
| SAM CLI | any recent | `sam --version` |
| AWS credentials | with Cognito + Lambda + API Gateway + IAM rights | `aws sts get-caller-identity` |

Credentials, either via `aws configure` or exported for the session:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."      # only for temporary/SSO credentials
```

Session tokens expire, usually in an hour. When a deploy suddenly fails with
`ExpiredToken`, re-export them — nothing is wrong with your stack.

Never commit these. Keep them in your shell, a profile, or a secrets manager.

---

## Step 1 — provision Cognito

Install the CLI once, globally:

```bash
npm install -g @akhileshb/auth-cli@latest
auth --help
```

Run the wizard from your project root:

```bash
auth generate
```

It asks about region, pool name, sign-in attributes, password policy, MFA and
app clients, then writes a CloudFormation template to
`resources/auth/cognito-template.yaml`. See
[wizard answers explained](#wizard-answers-explained) for the choices that are
irreversible or that the backend depends on.

At the end it offers to deploy. Say yes, or do it yourself:

```bash
auth deploy resources/auth/cognito-template.yaml --stack-name my-auth
```

Other commands:

```bash
auth validate auth-config.yaml                        # check a config file
auth add-client resources/auth/cognito-template.yaml  # add an app client later
auth generate -o infra/cognito.yaml                   # choose the output path
auth deploy <file> --profile prod --region ap-south-1
```

### Collect the outputs

You need three values for step 2:

```bash
aws cloudformation describe-stacks --stack-name my-auth \
  --query 'Stacks[0].Outputs' --output table
```

| Output | Used as |
|---|---|
| `UserPoolId` | `CognitoUserPoolId` |
| `UserPoolArn` | `CognitoUserPoolArn` |
| `AppClient<Name>Id` | `CognitoUserPoolClientId` |

If you generated a client secret, fetch it separately — it is never a stack
output:

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id <UserPoolId> --client-id <ClientId> \
  --query 'UserPoolClient.ClientSecret' --output text
```

---

## Step 2 — deploy the auth API

```bash
npm install @gprasad/auth-backend
```

This installs an `auth/` folder into your project: `handlers/` (one Lambda per
route), `lib/` (Cognito wrapper, JWT verification, helpers), `template.yaml`
(the whole infrastructure) and `.env.example`.

### Configure

Copy `.env.example` to `.env` and fill it in. `RESET_TOKEN_SECRET` has no
default on purpose — it signs the short-lived password-reset token, and a
shared default would let anyone forge a reset for any account:

```bash
export ProjectName="my-app"
export Environment="dev"
export ApiStageName="v1"
export CognitoUserPoolId="ap-south-1_xxxxxxxxx"
export CognitoUserPoolArn="arn:aws:cognito-idp:ap-south-1:...:userpool/..."
export CognitoUserPoolClientId="xxxxxxxxxxxxxxxxxxxxxxxxxx"
export CognitoClientSecret=""                       # blank if you made none
export RESET_TOKEN_SECRET="$(openssl rand -base64 48)"
export CorsAllowOrigin="*"                          # lock this down for prod
export LogRetentionInDays="7"
export LogLevel="info"
export ThrottlingRateLimit="50"
export ThrottlingBurstLimit="100"
export ManageApiGatewayAccount="true"
```

Add `.env` to `.gitignore`.

### Deploy

Run SAM from the **npm root** — the folder with `package.json` and
`node_modules`, not from inside `auth/`. The template's `CodeUri` is `../`, so
SAM installs production dependencies from the package.json in that build
context:

```bash
npm run deploy:env        # uses the .env above
# or, first time, to be prompted for everything:
npm run deploy:guided
```

The deploy validates, builds, shows you the resource diff and waits for `y`.

Take the API URL from the outputs:

```bash
aws cloudformation describe-stacks --stack-name my-app-dev-auth \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text
# https://abc123.execute-api.ap-south-1.amazonaws.com/v1
```

### Smoke-test it

```bash
API="https://abc123.execute-api.ap-south-1.amazonaws.com/v1"

curl -s -X POST "$API/auth/signup" -H 'content-type: application/json' \
  -d '{"firstName":"Jane","lastName":"Doe","email":"jane@example.com","password":"Passw0rd!"}'
# {"message":"..."} and Cognito emails a code

curl -s -X POST "$API/auth/verify-otp" -H 'content-type: application/json' \
  -d '{"identifier":"jane@example.com","otp":"123456"}'
# {"message":"Account verified — you can sign in now"}

curl -s -X POST "$API/auth/signin" -H 'content-type: application/json' \
  -d '{"email":"jane@example.com","password":"Passw0rd!"}'
# {"idToken":"...","refreshToken":"...","user":{...}}
```

Get all three responses before touching the frontend. Debugging Cognito
through a React form is much harder than through curl.

---

## Step 3 — frontend

The whole frontend, start to finish:

```bash
# 1. fresh app
npm create vite@latest my-app -- --template react
cd my-app
npm install

# 2. install the auth package — scaffolds src/auth/ (and nothing else)
npm install @7edge/auth-client

# 3. finish the setup — asks before it touches .env, main.jsx or App.jsx
npx auth-client setup

# 4. point it at the API from step 2
#    .env  ← edit the placeholder auth-client wrote
#    VITE_API_BASE_URL=https://abc123.execute-api.ap-south-1.amazonaws.com/v1

# 5. run
npm run dev
```

That is the entire integration. The rest of this section explains what those
five commands did, and what to do if you decline any of the prompts.

### What each step does

**Step 2 — install.** Scaffolds `src/auth/` (7 screens, 7 primitives,
validation, constants) and prints a banner. It deliberately leaves `.env`,
`src/main.jsx` and `src/App.jsx` **untouched** — it never edits a file you
wrote without asking. It also drops `src/auth/NEXT-STEPS.txt` listing what is
left; delete it once you are set up.

**Step 3 — `npx auth-client setup`.** The two steps that modify your files, each
behind a prompt:

| Prompt | What it does | If you decline |
|---|---|---|
| *Create / append `.env`* | adds `VITE_API_BASE_URL` with a placeholder value | it prints the block to paste |
| *Wire them up now?* | replaces `src/main.jsx` + `src/App.jsx`, keeping `.bak` copies | it points at the two files to copy |

Run the pieces individually if you prefer: `npx auth-client env` (just `.env`),
`npx auth-client wire` (just the app files), `npx auth-client init` (just
`src/auth/`). `npx auth-client status` shows what is done and what is left;
`npx auth-client undo` restores `main.jsx` and `App.jsx` from the `.bak` copies.

**Step 4 — the base URL.** `setup` writes a **placeholder**, not a working URL:

```bash
VITE_API_BASE_URL=https://REPLACE-ME.execute-api.ap-south-1.amazonaws.com/v1
```

Replace it with the API URL from [step 2](#step-2--deploy-the-auth-api), then
restart the dev server — Vite reads `.env` only at startup. Leaving the
placeholder in produces a network error on the first request, not a build error.

### Wiring it by hand

If you declined the wiring prompt, this is what it would have written:

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@7edge/auth-client/style.css'   // once, at the root
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

// Split out from App: a component cannot read a context its own parent provides.
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

Two things worth noting. `authConfig` comes from the package
(`@7edge/auth-client/config` via the `./auth` barrel), so there is no config
file to maintain — it reads `VITE_API_BASE_URL` for you. And `Root` is a
separate component on purpose: `useAuth()` cannot run in `App`, because a
component cannot consume a context that it renders the provider for.

The generated files import neither `src/App.css` nor `src/index.css` — they use
`@7edge/auth-client/style.css` and `src/auth/home.css` instead. Vite's starter
CSS is left orphaned, so delete it to stop it interfering:

```bash
rm -f src/App.css src/index.css
```

Everything in `src/auth/` is **yours**. An upgrade will not overwrite it.

Full frontend detail — the integration paths, calling your own API with the
session, route protection, theming — is in
[auth-client/docs/INTEGRATION.md](../auth-client/docs/INTEGRATION.md).

---

## Sign-in has no OTP

Worth understanding, because it is the opposite of what most OTP-based
libraries do, and because it is where 0.2.0 broke.

Cognito owns verification end to end. A code is sent **once**, at sign-up, to
confirm the account. Sign-in afterwards is a straight password exchange:

```
signUp ──► Cognito emails a code ──► verifyOtp (confirms account, no tokens)
                                            │
                                            ▼
                              signIn ──► tokens ──► authenticated
```

| Route | Returns | Authenticates? |
|---|---|---|
| `POST /auth/signup` | `{message}` | No — Cognito sends the code |
| `POST /auth/verify-otp` | `{message}` | **No** — confirming ≠ authenticating |
| `POST /auth/signin` | `{idToken, refreshToken, user}` | **Yes** |

The original design used a Cognito `CUSTOM_AUTH` challenge chain for an OTP on
every sign-in. It was dropped because Cognito's built-in sender cannot deliver
a custom-auth challenge — only messages Cognito composes itself — so it needed
a verified SES identity to work at all.

`@7edge/auth-client` **0.2.1** matches this: `signIn()` persists the session and
flips `isAuthenticated`; `verifyOtp()` only confirms an account. Nothing to do.

**On 0.2.0** the client expected the reverse — an OTP after sign-in, with tokens
arriving from `verify-otp`. Paired with this backend, a correct password takes
you to the OTP screen and strands you there, because the tokens were in the
sign-in response that screen discarded. Fix by upgrading:

```bash
npm install @7edge/auth-client@latest
npx auth-client init --force   # re-scaffold the screens; commit your edits first
```

`--force` overwrites your screen edits, which is why you commit first.

### Two other differences worth knowing

**No `accessToken`.** The backend returns `idToken` and `refreshToken` only.
`getAccessToken()` returns `null`. Use `getValidToken()` (the id token) for
your `Authorization` headers — which is what auth-client sends anyway.

**`/auth/refresh` and client secrets.** That route receives only
`{refreshToken}` with no username, so it cannot compute Cognito's
`SECRET_HASH`. It works when the app client has **no** secret. If yours does,
either generate the client without a secret (the normal choice for a
browser-facing SPA) or extend the handler to carry the identifier through.

This is the single strongest reason to answer **No** to "Generate client
secret?" in the wizard for any SPA or mobile client.

---

## End-to-end test

1. `npm run dev`, open the app — the sign-in screen renders.
2. **Create account** → submit → Cognito emails a code.
3. **Enter the code** → "Account verified" → back to sign-in.
4. **Sign in** → you land in the app.
5. **Reload** → still signed in (the session rehydrates from `localStorage`).
6. **Two tabs, sign out in one** → the other clears too.
7. Check `localStorage`: `auth_tokens` holds the bundle, `auth_user` the profile.

If step 4 leaves you on an OTP screen, you are on auth-client 0.2.0 — see
[sign-in has no OTP](#sign-in-has-no-otp).

---

## Wizard answers explained

The ones that matter, and why.

| Question | Guidance |
|---|---|
| **How will users sign in?** | **Cannot be changed after the pool is created.** Getting this wrong means deleting the pool and every user in it. |
| **Auto-verify email addresses?** | Say **Yes** if you want the sign-up flow to work. With this off, Cognito sends **no verification code at all** and `verify-otp` has nothing to confirm. |
| **Generate client secret?** | **No** for SPAs and mobile. A browser cannot keep a secret, and `/auth/refresh` cannot handle one (see above). Yes only for a server-side client. |
| **Auth flows** | The backend needs `ALLOW_ADMIN_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`. Without the first, sign-in fails with `Auth flow not enabled for this client`. |
| **Deletion protection** | **Yes** for prod. **No** for a dev stack you intend to tear down — otherwise you must disable it by hand before the stack will delete. |
| **Token validity** | The 1-minute values in a quick demo make every request refresh. auth-client refreshes 30s before expiry, so a 1-minute token is born nearly inside the skew window. Use **60 minutes** for id/access tokens and **30 days** for refresh. |
| **MFA** | The backend implements no MFA challenge. If you enable it as *required*, sign-in returns "Additional verification required" and stops. Leave it **Off** unless you are extending the handlers. |
| **Lambda triggers** | Leave all blank. This backend needs none. |

---

## Troubleshooting

**`ExpiredToken` / `InvalidClientTokenId` on deploy** — AWS session credentials
expired. Re-export them.

**`Auth flow not enabled for this client`** — the app client is missing
`ALLOW_ADMIN_USER_PASSWORD_AUTH`. Add it in the Cognito console, or regenerate
and redeploy.

**Sign-up succeeds but no email arrives** — `AutoVerifiedAttributes` does not
include `email`. Cognito only sends a code for auto-verified attributes. Check
the spam folder first; Cognito's default sender has a low daily cap, and SES is
needed for real volume.

**`ExpiredCodeException` on a code you just received** — usually the username
alias, not the code. `verify-otp` must name the user the way sign-up created
it; the alias only resolves once the account is CONFIRMED.

**`TypeError: The "key" argument must be of type string`** —
`RESET_TOKEN_SECRET` is unset. Generate one with `openssl rand -base64 48`.

**CORS errors in the browser** — set `CorsAllowOrigin` to your app's origin and
redeploy. `*` works in dev but not with credentials.

**`sam build` fails with missing dependencies** — you ran it from inside
`auth/`. Run it from the npm root.

**Signed in but requests 401** — you are attaching `getIdToken()` instead of
`await getValidToken()`, so an expired token goes out unrefreshed.

**Every request triggers a refresh** — your token TTL is shorter than the 30s
refresh skew. Raise the TTL, or lower `expirySkewSeconds`.

**Stuck on the OTP screen after a correct sign-in** — you are on auth-client
0.2.0. Check with `npm ls @7edge/auth-client`; the install banner also prints
the version. Installing from a git URL (`npm install github:Nishan666/auth-client`)
pins you to whatever that branch holds, which may be behind the published
package — prefer `npm install @7edge/auth-client@latest`. See
[sign-in has no OTP](#sign-in-has-no-otp).

**`.env` is missing after `npm install`** — expected. Install scaffolds
`src/auth/` only; `.env` comes from `npx auth-client setup` (or
`npx auth-client env`). `npx auth-client status` lists what is still outstanding.

**The app loads but every auth request fails** — `VITE_API_BASE_URL` is still
the `REPLACE-ME` placeholder, or you edited `.env` without restarting the dev
server.

**`npx auth-client setup` changed files you wanted left alone** — run
`npx auth-client undo` to restore `main.jsx` and `App.jsx` from the `.bak`
copies it kept.

---

## Teardown

Delete in reverse order — the API stack references the pool:

```bash
# 1. the API
cd <npm root> && npm run destroy      # or: sam delete --stack-name my-app-dev-auth

# 2. the Cognito stack
aws cloudformation delete-stack --stack-name my-auth
```

If deletion protection is on, the pool stack will refuse to delete. Turn it off
first:

```bash
aws cognito-idp update-user-pool --user-pool-id <id> --deletion-protection INACTIVE
```

Deleting the pool deletes every user in it, irreversibly.
