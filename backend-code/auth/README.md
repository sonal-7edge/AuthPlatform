# auth

Reusable AWS Lambda functions for common backend auth flows — Sign Up, Sign In, OTP,
Logout and Token Refresh — backed by Amazon Cognito. Framework/IaC-agnostic: every handler
is a plain `exports.handler = async (event) => {...}`, so you wire it into API Gateway /
Cognito Lambda triggers with whatever tooling you already use (Serverless Framework, SAM,
CDK, Terraform...).

```
auth/
  lib/       # Cognito SDK wrapper, JWT verification, response helpers
  handlers/  # one Lambda per API endpoint
```

## Implemented in this pass

| Endpoint | Handler | Request body | Response |
|---|---|---|---|
| `/auth/signup` | `handlers/sign_up.js` | `{firstName,lastName,email\|phone,password}` | `{message}` |
| `/auth/verify-otp` | `handlers/verify_otp.js` | `{identifier,otp}` | `{message}` |
| `/auth/signin` | `handlers/sign_in.js` | `{email\|phone,password}` | `{idToken,refreshToken,user}` |
| `/auth/logout` | `handlers/logout.js` | `Authorization: Bearer <idToken>` | `{message}` |
| `/auth/refresh` | `handlers/refresh_token.js` | `{refreshToken}` | `{idToken,refreshToken}` |
| `/auth/tokens` | `handlers/tokens.js` | `{email}` | **501 — not implemented, see below** |

⚠️ **This differs from the `auth-client` contract** (`auth-client/src/core/constants.js` on branch
`CNE-444-...`), which expects `signin` to return `{message}` and `verify-otp` to return the tokens.
Verification codes are now sent by Cognito itself rather than by this service, and Cognito only sends
its own messages — which means sign-up verification and sign-in are separate operations and there is
no OTP round on sign-in. The frontend needs updating to match: `signin` yields tokens directly, and
`verify-otp` only confirms a new account.

## How verification works

Cognito owns the code end to end — this service never generates, stores or sends one.

1. `POST /auth/signup` calls `SignUp` and stops there, leaving the user **UNCONFIRMED**. That is
   what makes Cognito send its own verification code, using the user pool's message configuration
   (its default sender needs no SES setup).
2. `POST /auth/verify-otp` calls `ConfirmSignUp` with that code, moving the user to **CONFIRMED**.
   It returns `{message}` and no tokens: confirming an account is not authenticating, and the
   request carries no password to authenticate with.
3. `POST /auth/signin` calls `AdminInitiateAuth` with `ADMIN_USER_PASSWORD_AUTH` and gets tokens
   back on the first call. No second step, no OTP, nothing carried between requests.

The previous design used a Cognito `CUSTOM_AUTH` challenge chain with three trigger Lambdas that
generated the OTP and delivered it over SES/SNS. It was replaced because Cognito's built-in sender
cannot deliver a custom-auth challenge — only messages Cognito composes itself — so that design
required a verified SES identity to work at all. Dropping it removed three Lambda functions,
`lib/notifier.js`, `lib/otpChallenge.js`, `lib/challengeSessionStore.js`, the SES and SNS IAM grants,
and two SDK dependencies.

It also removed a bug that made the old flow unusable when deployed: the pending-challenge `Session`
lived in a module-level `Map`, so `/auth/verify-otp` — a different Lambda from `/auth/signin` — never
saw what was written and always answered *"No pending verification for this identifier"*. There is no
cross-request state left to share.

**Cost of the change:** sign-in has no second factor. If you want one, Cognito's own MFA
(`set-user-pool-mfa-config`) is the place to add it rather than a hand-rolled challenge chain — note
that email MFA needs the Essentials tier and, as far as I can tell, an SES configuration.

## Required Cognito configuration (provisioning is a separate concern — see CNE-442)

This package assumes a User Pool + App Client already exist with:

- Explicit auth flows: `ALLOW_ADMIN_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`.
- **`AutoVerifiedAttributes` must include `email`** (and/or `phone_number`). This is what makes
  Cognito send a verification code on `SignUp`. Without it sign-up succeeds and no code is ever
  sent, which looks exactly like a broken email setup.
- No Lambda triggers. Nothing in this package needs wiring into the pool's `LambdaConfig`.
- The IAM execution role is created by `template.yaml`; it needs no SES or SNS access, because
  Cognito sends the messages.

For **email**, the pool's default sender (`EmailSendingAccount: COGNITO_DEFAULT`) works with no
setup, capped at 50 messages/day — fine for development, not for production. For **phone**, the pool
needs its own SMS configuration (an SNS caller role), which the default sender does not cover.

## Environment variables

`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` (optional),
`CORS_ALLOW_ORIGIN`. `AWS_REGION` comes from the Lambda runtime. All of them are set once in `template.yaml` under `Globals.Function.Environment` and
fed from stack parameters — see [docs/api-infrastructure.md](docs/api-infrastructure.md#8-environment-variables).

## Known limitation — `/auth/refresh` and app clients with a secret

`POST /auth/refresh` only receives `{refreshToken}` — no username — so it can't compute
Cognito's `SECRET_HASH` (which is keyed by username). This works as-is when the app client has
**no** client secret configured (the common choice for a browser-facing SPA client). If your
app client does have a secret, extend the request to also carry the identifier and pass it
through to `Cognito.refreshTokens(refreshToken, username)`.

## `/auth/tokens` — unresolved contract gap

`auth-client`'s `fetchTokens()` calls this with only `{email}`, and no UI screen actually uses
it (dead code in the current build). Minting tokens from an email alone with no proof of
identity would be a security hole, so this handler always returns `501`. If this needs to do
something real, the `auth-client` contract needs to change first (e.g. carry a refresh token
or a signed session artifact) — flag with whoever owns CNE-444.

## Deferred to a follow-up pass

`resend-otp`, `forgot-password`, `verify-reset-otp`, `reset-password`, `change-password`,
`delete-account` — all reuse `lib/Cognito.js` and `lib/verifyIdToken.js`. One design note for
whoever picks these up: Cognito's native `ConfirmForgotPassword` needs the new password at the
same time as the code, but the `auth-client` contract splits "verify code" and "set new
password" into two separate calls. Bridge that by calling `ConfirmForgotPassword` with a
throwaway random password at verify-time (spends the code), returning a signed short-lived
`resetToken`, then using `AdminSetUserPassword` with the real new password when `reset-password`
is called with that token.

## Running locally

From `backend-code/`, not from here:

```bash
cd backend-code
npm install
npm test    # jest, mocks CognitoIdentityProviderClient via aws-sdk-client-mock — no AWS account needed
npm run lint
```

There is no live Cognito User Pool in this environment, so these tests are the extent of
verification possible here. End-to-end verification against a real pool and the running
`auth-client` / `frontend-code` is a manual follow-up (CNE-442).

## Deploying with SAM

`template.yaml` is a single hand-edited SAM template: one Lambda + CloudWatch log group per
route, an API Gateway REST API in front of them, and one shared IAM role.

Dependencies and every command live at `backend-code/` — `auth/` holds only source, docs and the
template. `CodeUri` in the template is `../` for that reason, which is also why each `Handler` is
`auth/handlers/<name>.handler`.

```bash
cd backend-code
npm install
npm run deploy
```

That's it, on any machine, including a fresh clone. `samconfig.toml` is **committed**, so the stack
name, region and Cognito parameters are already filled in — nothing to configure. The command
validates the template, builds, shows you the resource diff, and waits for `y` before touching AWS.

What you need first: the SAM CLI, and AWS credentials for the target account.

### Changing the settings

```bash
npm run deploy:guided
```

Re-prompts for everything and rewrites `samconfig.toml`. Two things to check in the diff before
committing what it wrote:

- it saves `capabilities = "CAPABILITY_IAM"`, but this template needs `CAPABILITY_NAMED_IAM` because
  the execution role has an explicit name. The npm scripts pass the right one on the command line, so
  deploys still work — but fix the file anyway so it isn't misleading.
- **never let `CognitoClientSecret` end up in there.** It is a real secret and that file is in git. If
  the app client has one, pass it per-deploy instead:
  `npm run build && sam deploy --parameter-overrides "$(existing overrides)" CognitoClientSecret=...`

Note the guided prompt for `CognitoClientSecret` is a hidden `getpass` field — a paste doesn't echo,
which looks like it failed. Press Enter to skip it; most app clients have no secret.

### Deploying a second stack

`samconfig.toml` points at one account, one pool, one stack. For a second environment, override just
what differs and give it its own config env:

```bash
npm run build
sam deploy --config-env staging --stack-name authplatform-staging-auth --save-params \
  --capabilities CAPABILITY_NAMED_IAM --resolve-s3 \
  --parameter-overrides Environment=staging \
    CognitoUserPoolId=<pool> CognitoUserPoolArn=<arn> CognitoUserPoolClientId=<client> \
    ManageApiGatewayAccount=false
```

`ManageApiGatewayAccount=false` for any stack after the first in a given account and region — only one
can own that account-wide API Gateway logging role.

Or drive SAM directly and pass everything explicitly:

```bash
sam deploy \
  --stack-name authplatform-dev-auth \
  --region ap-south-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    Environment=dev \
    CognitoUserPoolId=ap-south-1_AbCdEf123 \
    CognitoUserPoolArn=arn:aws:cognito-idp:ap-south-1:111122223333:userpool/ap-south-1_AbCdEf123 \
    CognitoUserPoolClientId=1h57kf5cpq17m0eml12EXAMPLE
```

Either way, redeploys after the first are just `npm run deploy`.

One thing to check on a **brand-new AWS account**: add `ManageApiGatewayAccount=true` to the
parameter overrides so the stack creates API Gateway's account-wide CloudWatch Logs role. Without it
the stage's access logging fails at create time. See
[docs/api-infrastructure.md](docs/api-infrastructure.md#5-deploying).

Nothing needs attaching to the user pool — this stack creates no Cognito triggers.

### Testing it

```bash
sam local start-api --port 3000

curl -s localhost:3000/auth/signup -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"Str0ng-Passw0rd!"}'

# one function, no API Gateway — event on stdin
sam local generate-event apigateway aws-proxy --method POST --path auth/signin \
    --body '{"email":"ada@example.com","password":"Str0ng-Passw0rd!"}' \
  | sam local invoke SigninFunction --event -

# logs from the deployed stack
sam logs --stack-name authplatform-dev-auth --name SignupFunction --tail
```

`sam local` needs the same environment variables the stack sets. Pass them with
`--env-vars`, or export them into a file first — see the docs.

### Adding an endpoint

Copy two blocks in `template.yaml` and change five values. Full walkthrough:
[docs/api-infrastructure.md §3](docs/api-infrastructure.md#3-adding-an-endpoint).

Each handler is independent — no state is carried between requests — so nothing here depends on two
Lambdas sharing memory.
