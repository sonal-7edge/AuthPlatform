# AuthPlatform — Integration & Usage Guide

> **Audience:** teams who want to adopt AuthPlatform to provision AWS Cognito authentication for their applications, and developers integrating their apps with the resulting user pools.
>
> **Related doc:** [STS AssumeRole Integration Guide](./sts-assumerole-integration.md) — how to deploy the generated infrastructure without long-lived AWS keys.

---

## 1. What AuthPlatform is

AuthPlatform is a monorepo that centralises authentication provisioning for your organisation:

| Component | Path | What it does |
|---|---|---|
| **Admin dashboard** | `admin-code/admin-frontend` | React wizard that lets an operator design a Cognito **User Pool** (sign-in options, password policy, MFA, attributes, recovery, messaging, device tracking, security, Lambda triggers, app clients, hosted-UI domain) and generates a ready-to-deploy **CloudFormation template** (YAML or JSON). |
| **Admin backend** | `admin-code/admin-backend` | Express API service (health endpoints today; AWS provisioning helpers planned). |
| **Backend service** | `backend-code` | Scaffold for the future runtime auth service (token verification, auth APIs). Not yet implemented. |
| **End-user frontend** | `frontend-code` | Scaffold for the end-user-facing application. |
| **Documentation app** | `documentation-application` | React docs site; markdown sources live in `documentation-application/docs/`. |

The core workflow today:

```
Operator → Admin dashboard → CloudFormation template → deploy via STS AssumeRole → Cognito User Pool → your apps authenticate against it
```

---

## 2. Prerequisites

- **Node.js 20+** and npm
- An **AWS account** with permission to deploy CloudFormation stacks creating Cognito resources
- For keyless CI/CD deployment: the setup described in the [STS AssumeRole guide](./sts-assumerole-integration.md) (IAM Roles Anywhere trust anchor, profile, and role)
- (Optional) A verified **SES identity** if you configure custom email delivery, and an **SNS/SMS** setup if you enable SMS MFA

---

## 3. Running the platform locally

Each sub-project is installed and run independently (no root workspaces).

### 3.1 Admin dashboard (Cognito provisioning UI)

```bash
cd admin-code/admin-frontend
npm install
npm run dev          # Vite dev server → http://localhost:3000
```

### 3.2 Admin backend

```bash
cd admin-code/admin-backend
npm install
npm run dev          # or: npm start → http://localhost:8000
```

Configuration (`.env`, loaded via dotenv):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | HTTP listen port |

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Service check — `{status: 'OK'}` |
| `GET` | `/health` | Liveness — uptime + timestamp |

### 3.3 Documentation site

```bash
cd documentation-application
npm install
npm run dev          # Vite dev server → http://localhost:3000
```

> ⚠️ **Port note:** all three Vite apps (`frontend-code`, `admin-frontend`, `documentation-application`) default to port **3000**. To run two simultaneously, override one: `npm run dev -- --port 3001`.

---

## 4. Provisioning a Cognito User Pool (operator workflow)

1. **Open the admin dashboard** and enter your organisation name, AWS region, and unique ID when prompted.
2. **Walk through the wizard steps:**
   - *Basics / Sign-in* — pool name, sign-in identifiers (email / phone / username), case sensitivity
   - *Password policy* — length, character classes, temporary-password validity
   - *MFA* — off / optional / required; SMS or TOTP
   - *Attributes* — standard + custom attributes, required/mutable flags
   - *Account recovery* — email and/or phone recovery priority
   - *Messaging* — Cognito-default or SES email delivery, SMS role, custom sender Lambdas, email templates
   - *Devices* — device tracking and remembering
   - *Security* — advanced security features, prevention of user-existence errors
   - *App clients* — one client per consuming application (recommended for isolation), auth flows, token validity, OAuth scopes and callback URLs
   - *Domain* — Cognito hosted-UI domain prefix
3. **Review** — the final step validates the configuration and renders the CloudFormation template.
4. **Copy or Download** the template (YAML or JSON). Nothing is sent to any server — generation is fully client-side.

### 4.1 Deploying the template

**Recommended (keyless, CI/CD):** follow the [STS AssumeRole guide](./sts-assumerole-integration.md) to obtain short-lived credentials, then:

```bash
aws sts get-caller-identity   # verify you have the assumed role

aws cloudformation deploy \
  --template-file cognito-userpool.yaml \
  --stack-name <org>-auth-stack \
  --region <region> \
  --capabilities CAPABILITY_IAM
```

**What gets created:**
- `AWS::Cognito::UserPool` — the user directory with your policies
- One `AWS::Cognito::UserPoolClient` per app client
- `AWS::Cognito::UserPoolDomain` (if a hosted-UI domain was configured)
- `AWS::SES::Template` resources (if custom email templates were configured)

After deployment, note the stack **outputs** (User Pool ID, App Client IDs, hosted-UI domain) — your applications need these to integrate.

---

## 5. Integrating your application with the provisioned auth

Once the stack is deployed, each consuming application authenticates against the user pool using its **own app client**.

### 5.1 What you need

| Value | Where to find it |
|---|---|
| User Pool ID (`<region>_XXXXXXXXX`) | CloudFormation stack outputs / Cognito console |
| App Client ID | Stack outputs — use the client created for *your* application |
| AWS Region | Chosen during provisioning |
| Hosted-UI domain (optional) | `https://<prefix>.auth.<region>.amazoncognito.com` |

### 5.2 Frontend (JavaScript / React) example

```bash
npm install amazon-cognito-identity-js
# or the higher-level option:
npm install aws-amplify
```

```js
// Amplify v6 example
import { Amplify } from 'aws-amplify';
import { signIn, fetchAuthSession } from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: '<USER_POOL_ID>',
      userPoolClientId: '<APP_CLIENT_ID>',
    },
  },
});

await signIn({ username: 'user@example.com', password: '••••••••' });
const { tokens } = await fetchAuthSession();   // ID + access tokens (JWTs)
```

Use the **SRP auth flow** (`ALLOW_USER_SRP_AUTH`, enabled by default on generated clients) so passwords never transit in plaintext.

### 5.3 Hosted UI / OAuth 2.0

If a hosted-UI domain and OAuth settings were configured on your app client, redirect users to:

```
https://<prefix>.auth.<region>.amazoncognito.com/oauth2/authorize
  ?client_id=<APP_CLIENT_ID>
  &response_type=code
  &scope=openid+email+profile
  &redirect_uri=<YOUR_CALLBACK_URL>
```

Exchange the returned code at `/oauth2/token` for ID/access/refresh tokens.

### 5.4 Backend token verification

Verify incoming JWTs against the pool's JWKS:

```
https://cognito-idp.<region>.amazonaws.com/<USER_POOL_ID>/.well-known/jwks.json
```

```bash
npm install aws-jwt-verify
```

```js
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: '<USER_POOL_ID>',
  tokenUse: 'access',
  clientId: '<APP_CLIENT_ID>',
});

const payload = await verifier.verify(token); // throws if invalid/expired
```

### 5.5 Server-to-server / infrastructure access

Services and pipelines that need AWS API access (e.g. to manage the pool) should use **short-lived STS credentials**, never static keys — see the [STS AssumeRole guide](./sts-assumerole-integration.md):

- **Inside AWS** — attach an IAM role to the workload, or `sts:AssumeRole` across accounts.
- **Outside AWS (CI/CD, on-prem)** — IAM Roles Anywhere with an X.509 certificate + `aws_signing_helper` as a credential process.

---

## 6. Onboarding checklist for a new team

1. ☐ Request an app client for your application from the platform operator (one client per app).
2. ☐ Receive User Pool ID, App Client ID, region (+ hosted-UI domain if applicable).
3. ☐ Wire the frontend auth flow (§5.2 or §5.3).
4. ☐ Add JWT verification to your backend (§5.4).
5. ☐ For deployments, set up keyless credentials (§5.5).
6. ☐ Confirm callback/logout URLs registered on your app client match your environments.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `NotAuthorizedException: Unable to verify secret hash` | Your app client was created **with** a client secret but your public (browser) app can't send one — use a client without a secret for SPAs. |
| Redirect mismatch on hosted UI | Callback URL not registered exactly (scheme, host, path) on the app client. |
| `Token expired` immediately after login | Check the token-validity units/values configured on the app client. |
| `AccessDenied` when deploying the template | Your assumed role lacks Cognito/SES/CloudFormation permissions — see least-privilege policy in the STS guide §5.1. |
| Two dev servers won't start | Port 3000 collision — run one with `--port 3001`. |

---

*This document is maintained automatically: when a pull request is merged, the docs-update workflow reviews the change and refreshes this guide, the changelog, and related docs. See `.github/workflows/docs-update.yml`.*
