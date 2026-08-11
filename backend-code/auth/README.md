# auth

Reusable AWS Lambda functions for common backend auth flows — Sign Up, Sign In, OTP,
Logout and Token Refresh — backed by Amazon Cognito. Framework/IaC-agnostic: every handler
is a plain `exports.handler = async (event) => {...}`, so you wire it into API Gateway /
Cognito Lambda triggers with whatever tooling you already use (Serverless Framework, SAM,
CDK, Terraform...).

```
auth/
  lib/       # Cognito SDK wrapper, OTP session store, notifier, JWT verification, helpers
  handlers/  # one Lambda per API endpoint / Cognito trigger
```

## Implemented in this pass

| Endpoint | Method | Request body | Response |
|---|---|---|---|
| `/auth/signup` | `handlers/sign_up.js` | `{firstName,lastName,email\|phone,password}` | `{message}` |
| `/auth/signin` | `handlers/sign_in.js` | `{email\|phone,password}` | `{message}` |
| `/auth/verify-otp` | `handlers/verify_otp.js` | `{identifier,otp}` | `{idToken,refreshToken,user}` |
| `/auth/logout` | `handlers/logout.js` | `Authorization: Bearer <idToken>` | `{message}` |
| `/auth/refresh` | `handlers/refresh_token.js` | `{refreshToken}` | `{idToken,refreshToken}` |
| `/auth/resend-otp` | `handlers/resend_otp.js` | `{identifier}` | `{message}` |
| `/auth/forgot-password` | `handlers/forgot_password.js` | `{email\|phone}` | `{message}` |
| `/auth/verify-reset-otp` | `handlers/verify_reset_otp.js` | `{identifier,otp}` | `{resetToken}` |
| `/auth/reset-password` | `handlers/reset_password.js` | `{resetToken,newPassword}` | `{message}` |
| `/auth/change-password` | `handlers/change_password.js` | `Authorization: Bearer <idToken>`, `{currentPassword,newPassword}` | `{message}` |
| `/auth/delete-account` | `handlers/delete_account.js` | `Authorization: Bearer <idToken>`, `{password}` | `{message}` |
| `/auth/tokens` | `handlers/tokens.js` | `{email}` | **501 — not implemented, see below** |

Plus three Cognito **Lambda triggers** that implement the OTP mechanism itself:
`handlers/define_auth_challenge.js`, `handlers/create_auth_challenge.js`,
`handlers/verify_auth_challenge_response.js`.

This mirrors the contract already shipped by the `auth-client` frontend package
(`auth-client/src/core/constants.js` on branch `CNE-444-...`), so both sides line up without
further negotiation.

## Why Cognito custom-auth challenges, not a hand-rolled OTP store

`signIn` sends `{identifier, password}` once and only gets `{message}` back — no tokens.
`verifyOtp` then completes login. Instead of building a bespoke OTP table, this uses
Cognito's native `CUSTOM_AUTH` flow as a two-round challenge chain:

1. **Round 1 (password)** — `sign_in.js` starts `CUSTOM_AUTH` and immediately answers round 1
   with the password itself, server-side — the client never sees this round. It's checked
   inside `verify_auth_challenge_response.js` via `AdminInitiateAuth(ADMIN_USER_PASSWORD_AUTH)`.
2. **Round 2 (OTP)** — once round 1 passes, `create_auth_challenge.js` generates a 6-digit
   code, sends it (SES for email / SNS for phone), and stores its hash in Cognito's
   challenge parameters. `sign_in.js` stashes the `Session` Cognito hands back, keyed by
   identifier, and returns `{message: 'OTP sent...'}`.
3. `verify_otp.js` looks up that `Session` and answers round 2 with the code the user typed.
   `define_auth_challenge.js` allows up to 3 OTP attempts (each wrong attempt sends a fresh
   code) before failing; on success it tells Cognito to issue tokens, which come back on the
   same `RespondToAuthChallenge` call.

`sign_up.js` creates the user (`SignUpCommand`) and confirms it itself
(`AdminConfirmSignUpCommand`, bypassing Cognito's own confirmation code — there's only ever
one OTP mechanism in this system), then feeds straight into the same round-2 kickoff as
sign-in. `verify_otp.js` is therefore the single completion point for both signup and signin.

## Required Cognito configuration (provisioning is a separate concern — see CNE-442)

This package assumes a User Pool + App Client already exist with:

- Explicit auth flows: `ALLOW_CUSTOM_AUTH`, `ALLOW_ADMIN_USER_PASSWORD_AUTH`,
  `ALLOW_REFRESH_TOKEN_AUTH`.
- Lambda triggers wired to (function ARNs of):
  - `DefineAuthChallenge` → `handlers/define_auth_challenge.js`
  - `CreateAuthChallenge` → `handlers/create_auth_challenge.js`
  - `VerifyAuthChallengeResponse` → `handlers/verify_auth_challenge_response.js`
- IAM execution role for every handler in this package needs `cognito-idp:AdminInitiateAuth`,
  `cognito-idp:AdminConfirmSignUp`, `cognito-idp:AdminUserGlobalSignOut`,
  `cognito-idp:AdminGetUser`, `cognito-idp:AdminSetUserPassword`, `cognito-idp:AdminDeleteUser`
  scoped to the pool, plus `ses:SendEmail` / `sns:Publish` for the three trigger Lambdas (OTP
  delivery) and for Cognito's own ForgotPassword code delivery.

## Environment variables

See `.env.example`: `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
`COGNITO_CLIENT_SECRET` (optional), `SES_FROM_EMAIL`, `OTP_TTL_SECONDS`, `RESET_TOKEN_SECRET`
(required — signs the forgot-password `resetToken`), `RESET_TOKEN_TTL_SECONDS`.

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

## Forgot-password design note

Cognito's native `ConfirmForgotPassword` needs the new password at the same time as the code,
but the `auth-client` contract splits "verify code" and "set new password" into two separate
calls (`verify-reset-otp` then `reset-password`). Bridged by calling `ConfirmForgotPassword`
with a throwaway random password inside `verify_reset_otp.js` (spends the code, proves it was
correct), returning a signed short-lived `resetToken` (`lib/resetToken.js`, HMAC-SHA256 over
`RESET_TOKEN_SECRET`), then `reset_password.js` uses `AdminSetUserPassword` with the real new
password when called with that token.

`change_password.js` and `delete_account.js` re-verify the caller's current password via
`AdminInitiateAuth(ADMIN_USER_PASSWORD_AUTH)` — the same check round 1 of sign-in uses — since
the client only ever holds an idToken, never an accessToken, so Cognito's own
`ChangePassword`/`DeleteUser` APIs (which take an access token) aren't usable here; both use the
admin (`AdminSetUserPassword` / `AdminDeleteUser`) equivalents instead.

`resend_otp.js` has no dedicated Cognito mechanism to hook into — every wrong answer to the OTP
round already makes `create_auth_challenge.js` issue a fresh code, so resend reuses that by
submitting an answer that can never match, at the cost of one of the `MAX_OTP_ATTEMPTS` retries.

## Running locally

```bash
npm install
npm test    # jest, mocks CognitoIdentityProviderClient via aws-sdk-client-mock — no AWS account needed
npm run lint
```

There is no live Cognito User Pool in this environment, so these tests are the extent of
verification possible here. End-to-end verification against a real pool (with the three
triggers wired into its Lambda config) and the running `auth-client` / `frontend-code` is a
manual follow-up once a dev pool exists (CNE-442).
