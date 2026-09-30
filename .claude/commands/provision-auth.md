---
description: Provision Cognito and deploy the auth API (AuthPlatform steps 1–2)
argument-hint: "[stack-name]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(auth *), Bash(npm install -g*), Bash(npm run*), Bash(aws cloudformation*), Bash(aws cognito-idp*), Bash(aws sts*), Bash(sam --version), Bash(openssl rand*), Bash(curl*), Bash(node -v), Bash(ls*), Bash(cat*)
---

Provision the AWS Cognito user pool and deploy the auth API for this project —
AuthPlatform steps 1 and 2. Stack name, if supplied: $1

## Reference documentation

Read `AuthPlatform/docs/GETTING-STARTED.md` first — steps 1 and 2, and the
wizard walkthrough. It is the source of truth. If the path does not resolve,
ask the user where the AuthPlatform repo is rather than guessing at CLI flags.

## Before touching AWS

This command creates real, billable AWS resources and can delete user accounts.
Confirm all of the following and **report them to the user before proceeding**:

```bash
aws sts get-caller-identity    # which account are we about to change?
sam --version                  # required; the CLI shells out to sam deploy
node -v                        # 20+
```

State the account ID and region and get explicit confirmation before the first
deploy. If credentials are missing or expired (`ExpiredToken`), stop and ask
the user to re-export them — do not attempt to work around it.

## Step 1 — provision Cognito

```bash
npm install -g @akhileshb/auth-cli@latest
auth generate
```

`auth generate` is an **interactive wizard** — you cannot drive it
non-interactively. Hand control to the user and tell them what to pick. The
answers that matter:

| Prompt | Tell the user |
|---|---|
| How will users sign in? | **Irreversible.** Changing it later means deleting the pool and every user in it. Multi-select — Space to toggle. |
| Auto-verify email addresses? | **`y`** — with `n`, Cognito sends no verification code at all and sign-up cannot complete. |
| Auth flows | Must include **Admin Password Auth**; the backend uses `ADMIN_USER_PASSWORD_AUTH`. Multi-select — Space to add it alongside SRP. |
| MFA Enforcement | **Disabled** — the backend implements no MFA challenge; `Required` breaks sign-in. |
| Token validity | Keep the defaults (60 min / 30 days). Very short tokens are born inside the refresh skew window. |
| Lambda triggers | Enter through all ten — none are needed. |
| Deletion protection | `y` for prod; `n` for a dev stack you plan to tear down. |

The wizard **always generates a client secret** and does not ask. That breaks
`/auth/refresh`, which cannot compute `SECRET_HASH`. Raise this with the user
and point them at "A note on client secrets" in GETTING-STARTED.md.

Then collect the outputs:

```bash
aws cloudformation describe-stacks --stack-name <stack> \
  --query 'Stacks[0].Outputs' --output table
```

You need `UserPoolId`, `UserPoolArn`, `CognitoUserPoolClientId` and
`CognitoClientSecret`.

## Step 2 — deploy the auth API

```bash
npm install @gprasad/auth-backend
```

Copy `.env.example` to `.env` and fill in the values from step 1, plus:

```bash
export RESET_TOKEN_SECRET="$(openssl rand -base64 48)"
```

`RESET_TOKEN_SECRET` has **no default on purpose** — it signs the
password-reset token, and a shared default would let anyone forge a reset for
any account. Generate a fresh one. Never commit `.env`; check it is gitignored.

Deploy from the **npm root** (the folder with `package.json`), not from inside
`auth/` — the template's `CodeUri` is `../`:

```bash
npm run deploy:env
```

Then take the `ApiUrl` output and smoke-test before anyone touches the
frontend:

```bash
API="<ApiUrl>"
curl -s -X POST "$API/auth/signup" -H 'content-type: application/json' \
  -d '{"firstName":"Test","lastName":"User","email":"<real-address>","password":"Passw0rd!"}'
```

Signup, verify-otp and signin should all succeed. Debugging Cognito through a
React form is much harder than through curl.

## When you are done

Report:

1. The AWS account and region used.
2. The stack names created.
3. The API base URL — the value the frontend needs for `VITE_API_BASE_URL`.
4. Whether the smoke test passed, with the actual responses.
5. Whether the app client has a secret, and therefore whether token refresh
   will work.

Then point the user at `/add-auth` to wire up the frontend.

Never report success for a step you did not verify. If a deploy failed or a
curl returned an error, show the output.
