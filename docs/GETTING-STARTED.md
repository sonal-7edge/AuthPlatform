# Getting started — Cognito to working login

The platform is three installable pieces. This guide runs all three in order,
from an empty folder to a React app with working sign-up and sign-in.

## Why this exists

Every new project used to rebuild the same authentication stack by hand, and
each one came out slightly different:

- **Cognito was provisioned by hand** — clicked through the console, or a
  CloudFormation template copied from the last project and edited. Settings that
  cannot be changed after creation (sign-in attributes) got chosen casually, and
  settings that matter (auth flows, token lifetimes, deletion protection) drifted
  between environments. Nobody could say what a given pool was configured with
  without going to look.
- **The auth API was rewritten each time** — signup, OTP confirmation, signin,
  refresh, forgot/reset password, change password, delete account. The same
  twelve endpoints, re-implemented against the Cognito SDK, each with its own
  bugs around token refresh and error handling.
- **The frontend was rebuilt each time** — seven screens, plus the genuinely
  hard parts underneath: refreshing a token before it expires, making sure ten
  concurrent requests trigger one refresh instead of ten, replaying a request
  after a 401, and keeping browser tabs in agreement about who is signed in.
  Those are easy to get subtly wrong and expensive to debug.

The three packages replace each of those with something standard:

| Instead of | You get |
|---|---|
| Hand-written CloudFormation, or console clicking | A wizard that asks the questions, validates the answers, and emits a deployable template |
| Re-implementing twelve Cognito endpoints | Lambda handlers you install and deploy |
| Rebuilding screens and token plumbing | Screens scaffolded into your project as editable files, with the refresh logic already solved |

What you keep: the screens and the handlers land in **your** repository as
ordinary files you own and edit. This is scaffolding, not a framework you are
locked into — an upgrade will not overwrite your changes, and there is no
runtime dependency on a shared service.


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

> **Using Claude Code?** `/add-auth` walks the frontend integration for you, and
> `/provision-auth` covers steps 1–2. See
> [.claude/commands/](../.claude/commands/README.md) for how to install them in
> your own repo. They read this guide rather than replacing it.

- [Why this exists](#why-this-exists)
- [Prerequisites](#prerequisites)
- [Step 1 — provision Cognito](#step-1--provision-cognito)
- [Step 2 — deploy the auth API](#step-2--deploy-the-auth-api)
- [Step 3 — frontend](#step-3--frontend)
- [Sign-in has no OTP](#sign-in-has-no-otp)
- [End-to-end test](#end-to-end-test)
- [Troubleshooting](#troubleshooting)
- [Teardown](#teardown)

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node | 20+ | `node -v` |
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

### Placeholders in this guide

Anything in `<angle-brackets>` is yours to fill in — `<your-app-name>`,
`<your-stack-name>`, `<api-id>`. Commands are not copy-paste-ready until you
replace them. Values without brackets (route paths, parameter names, defaults)
are literal and should be typed as shown.

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

It writes a CloudFormation template to
`resources/auth/cognito-template.yaml`, then offers to deploy it.

### How to answer the prompts

The wizard uses four kinds of prompt, and they are driven differently:

| Prompt style | How it looks | How to answer |
|---|---|---|
| **Single choice** (list) | `❯ ` marks the current row | **↑/↓** to move, **Enter** to pick. One answer only. |
| **Multi-select** (checkbox) | `◯` unchecked, `◉` checked | **↑/↓** to move, **Space** to toggle, **Enter** to submit. Pick more than one. |
| **Yes / no** | `(y/n)` | Type `y` or `n`, then **Enter**. There is no default — it re-asks until you answer. |
| **Text / number** | shows `(default)` | **Enter** accepts the default; type to override. |

Pressing **Enter** on a multi-select without toggling anything submits whatever
is pre-checked — which for *sign-in options* is `email`, and for *auth flows* is
`SRP Auth`.

### Every step, in order

**1. Cloud Provider** — single choice. Only `Amazon Web Services (Cognito)` is
selectable; Azure and GCP are listed but disabled (`coming soon`).

**2. AWS Region** — single choice from 17 regions, shown as
`Asia Pacific (Mumbai) (ap-south-1)`. Defaults to `us-east-1`. This is where the
pool is created; it must match where you deploy the backend.

**3. User Pool Name** — text. Letters, numbers, `_` and `-` only. The generated
template appends the stage, so `demo1` becomes `demo1-dev`.

**4. Allow self-registration?** — y/n. `n` means only an admin can create
accounts, and `/auth/signup` will fail. Say **`y`** unless you want admin-only
provisioning.

**5. Auto-verify email addresses?** — y/n. **Say `y`.** With `n`, Cognito sends
**no verification code at all**, and the sign-up flow cannot complete.

**6. Enable deletion protection?** — y/n. `y` for prod. `n` for a dev stack you
intend to tear down, or you must disable it by hand before the stack will delete.

**7. How will users sign in?** — **multi-select** (Space to toggle). Options:
email, phone (SMS OTP), username. Default `email`. At least one is required.

> **This cannot be changed after the pool is created.** Changing your mind means
> deleting the pool and every user in it. The frontend screens offer email and
> phone, so select what you will actually use.

**8. Password policy** — six prompts: minimum length (6–20, default 8), then
four y/n toggles for uppercase, lowercase, numbers and special characters, then
temporary password validity (1–365 days, default 7).

**9. MFA Enforcement** — single choice: `Disabled`, `Optional`, `Required`.
If you pick anything other than Disabled, it then asks for **one** MFA method
(Authenticator App (TOTP) or SMS) — a single choice, not a multi-select.

> **Leave this `Disabled`.** The backend implements no MFA challenge; with
> `Required`, sign-in returns "Additional verification required" and stops.

**10. Add custom user attributes?** — y/n. `y` loops: attribute name (max 20
chars), type (String / Number / Boolean / DateTime), mutable y/n, then min/max
constraints for String and Number. Asks "Add another?" after each. Custom
attributes are always optional — Cognito rejects required ones.

**11. App Clients** — repeats until you decline "Add another app client?":

| Prompt | Default | Notes |
|---|---|---|
| Client name | `web-client` | letters, numbers, `_`, `-` |
| Auth flows | `SRP Auth` | **multi-select**; Refresh Token is always added for you |
| Access token validity | 60 min | 5–1440 |
| ID token validity | 60 min | 5–1440 |
| Refresh token validity | 30 days | 1–3650 |
| Callback URL | — | up to 5; **Enter on an empty line stops** |
| Logout URL | — | same |

> **Select `Admin Password Auth`** in the auth-flows multi-select. The backend
> signs in with `ADMIN_USER_PASSWORD_AUTH`; without it, sign-in fails with
> `Auth flow not enabled for this client`. Use **Space** to add it alongside SRP.

> **Keep the token validity defaults.** auth-client refreshes 30s before expiry,
> so a very short token is born inside the skew window and every request
> triggers a refresh.

**12. Lambda triggers** — ten optional ARN prompts (Pre Sign-up, Post
Confirmation, Pre Authentication, …). **Press Enter through all ten.** This
backend needs none.

**13. Deploy now?** — y/n. Saying `y` asks for a stack name (defaults to the
pool name) and a deploy stage (`dev`, `qa`, `pre-prod`, `prod`), then runs
`sam deploy`. Saying `n` leaves you the template to deploy yourself:

```bash
auth deploy resources/auth/cognito-template.yaml --stack-name <your-stack-name>
```

### A note on client secrets

The wizard does **not** ask whether to generate a client secret — it always
generates one, and exports it as the `CognitoClientSecret` stack output. That
matters because `/auth/refresh` cannot compute Cognito's `SECRET_HASH` (it
receives only `{refreshToken}`, with no username), so **token refresh will fail
on a client that has a secret**.

Until the CLI exposes the choice, either accept that refresh is broken for that
client, extend the handler to carry the identifier, or create a secret-less app
client by hand:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id <UserPoolId> --client-name spa-client \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH
```

Other commands:

```bash
auth validate auth-config.yaml                        # check a config file
auth add-client resources/auth/cognito-template.yaml  # add an app client later
auth generate -o infra/cognito.yaml                   # choose the output path
auth deploy <file> --profile prod --region ap-south-1
```

### Collect the outputs

You need four values for step 2:

```bash
aws cloudformation describe-stacks --stack-name <your-stack-name> \
  --query 'Stacks[0].Outputs' --output table
```

| Output | Used as |
|---|---|
| `UserPoolId` | `CognitoUserPoolId` |
| `UserPoolArn` | `CognitoUserPoolArn` |
| `CognitoUserPoolClientId` | `CognitoUserPoolClientId` |
| `CognitoClientSecret` | `CognitoClientSecret` |

With a single app client the outputs are named exactly as the backend's
parameters expect, so they copy across directly. With more than one client they
are prefixed per client (`<ClientName>Id`, `<ClientName>Secret`) and you pick
the pair you want the backend to use.

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
export ProjectName="<your-project-name>"      # e.g. acme-portal
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
aws cloudformation describe-stacks --stack-name <your-project-name>-dev-auth \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text
# https://<api-id>.execute-api.<region>.amazonaws.com/v1
```

### Smoke-test it

```bash
API="<paste the ApiUrl output from above>"

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

```bash
npm create vite@latest <your-app-name> -- --template react
cd <your-app-name>
npm install

npm install github:Nishan666/auth-client
npx auth-client setup
```

`npx auth-client setup` asks before it touches `.env`, `src/main.jsx` or
`src/App.jsx`, and prints the manual equivalent if you decline. Run
`npx auth-client status` to see what is outstanding, `npx auth-client undo` to
restore `main.jsx` and `App.jsx` from the `.bak` copies it keeps.

The package is installed from GitHub — it is not published to npm, so
`npm install @7edge/auth-client` fails with a 404. `@7edge/auth-client` is the
name you *import* by; the git URL is how you install it.

Then set the base URL. `setup` writes a **placeholder**, not a working URL:

```bash
# .env
VITE_API_BASE_URL=https://REPLACE-ME.execute-api.ap-south-1.amazonaws.com/v1
```

Replace it with the API URL from [step 2](#step-2--deploy-the-auth-api) and
restart the dev server — Vite reads `.env` only at startup. Leaving the
placeholder in produces a network error on the first request, not a build error.

```bash
npm run dev
```

Everything in `src/auth/` is **yours**. An upgrade will not overwrite it.

Full frontend detail — the integration paths, wiring it by hand, calling your
own API with the session, route protection, theming — is in
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
npm uninstall @7edge/auth-client            # npm won't re-pull otherwise
npm install github:Nishan666/auth-client
npx auth-client init --force   # re-scaffold the screens; commit your edits first
```

`--force` overwrites your screen edits, which is why you commit first.

### Two other differences worth knowing

**No `accessToken`.** The backend returns `idToken` and `refreshToken` only.
`getAccessToken()` returns `null`. Use `getValidToken()` (the id token) for
your `Authorization` headers — which is what auth-client sends anyway.

**`/auth/refresh` and client secrets.** That route receives only
`{refreshToken}` with no username, so it cannot compute Cognito's
`SECRET_HASH`. It works only when the app client has **no** secret — and the
wizard always generates one. See
[a note on client secrets](#a-note-on-client-secrets) for the workarounds.

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
the version. The install resolves to whatever the git branch currently holds.
Re-running the install does **not** pull newer commits — npm prints `up to date`
and runs nothing, `--force` included. Remove the dependency first:

```bash
npm uninstall @7edge/auth-client
npm install github:Nishan666/auth-client
```

See [sign-in has no OTP](#sign-in-has-no-otp).

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
cd <npm root> && npm run destroy      # or: sam delete --stack-name <your-project-name>-dev-auth

# 2. the Cognito stack
aws cloudformation delete-stack --stack-name <your-stack-name>
```

If deletion protection is on, the pool stack will refuse to delete. Turn it off
first:

```bash
aws cognito-idp update-user-pool --user-pool-id <id> --deletion-protection INACTIVE
```

Deleting the pool deletes every user in it, irreversibly.
