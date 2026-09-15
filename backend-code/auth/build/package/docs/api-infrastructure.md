# Auth API Infrastructure — Endpoints, CloudFormation & Deployment

---

## 1. Purpose

This document covers how the auth API's AWS infrastructure is defined, changed and deployed.

Three things work together:

| Piece | File | Role |
|---|---|---|
| **Endpoint registry** | `config/endpoints.json` | The single source of truth. Every route lives here. |
| **CLI helper** | `cli/endpoint.js` | Adds/removes routes, scaffolds handlers, regenerates the template. |
| **Deploy script** | `deploy.sh` | Zips the code, uploads it to S3, deploys the stack. |

`resources/auth_cloudformation.yml` is **generated**. Never edit it by hand — the CLI overwrites it,
and `endpoint.js check` fails if it has drifted from the registry.

---

## 2. Layout

```
backend-code/auth/
├── cli/
│   └── endpoint.js              CLI: add | remove | list | show | scaffold | generate | check
├── config/
│   ├── endpoints.json           source of truth for every route
│   └── .env.example             copy to .env.<env> for deploy.sh (gitignored)
├── handlers/
│   └── <name>.js                one Lambda handler per endpoint
├── lib/
│   └── Cognito.js               Cognito SDK wrapper (handlers call into this)
├── resources/
│   ├── template.js              registry -> CloudFormation
│   ├── yaml.js                  minimal YAML serializer (build-time only)
│   └── auth_cloudformation.yml  GENERATED
├── utils/
│   └── helpers.js               shared response / parsing helpers
└── deploy.sh                    package -> S3 -> CloudFormation
```

---

## 3. What the template creates

For **every** endpoint in the registry, four resources are emitted:

```
                         ┌──────────────────────────────┐
  client ──── HTTPS ───► │  AWS::ApiGateway::RestApi    │  (REGIONAL, one per stack)
                         │                              │
                         │  ::Resource   /auth          │  one per path segment, deduped
                         │  ::Resource   /auth/signup   │
                         │                              │
                         │  ::Method     POST  ─────────┼──► authorizer? ──► AWS_PROXY
                         │  ::Method     OPTIONS ───────┼──► MOCK (CORS preflight)
                         └───────────────┬──────────────┘
                                         │
                    AWS::Lambda::Permission (scoped to this one route)
                                         │
                                         ▼
                         ┌──────────────────────────────┐
                         │  AWS::Lambda::Function       │  code from S3, arm64, Node 20
                         │  authplatform-dev-signup     │
                         └───────────────┬──────────────┘
                                         │
                         ┌───────────────▼──────────────┐
                         │  AWS::Logs::LogGroup         │  /aws/lambda/<function name>
                         │  retention: 30 days          │  created FIRST, so retention sticks
                         └──────────────────────────────┘
```

Plus, once per stack:

| Resource | Why |
|---|---|
| `AWS::IAM::Role` | One execution role shared by every function. Scoped to this stack's log groups and the one user pool. |
| `AWS::ApiGateway::Authorizer` | `COGNITO_USER_POOLS` and/or `TOKEN` — only emitted if a route actually uses it. |
| `AWS::ApiGateway::RequestValidator` | Enforces required headers at the edge, before Lambda is invoked. |
| `AWS::ApiGateway::GatewayResponse` | Adds CORS headers to 4XX/5XX raised *by API Gateway*, so auth failures aren't opaque network errors in the browser. |
| `AWS::ApiGateway::Deployment` | Logical id carries a hash of the routes, so a route change always publishes. |
| `AWS::ApiGateway::Stage` | Access logs, INFO method logging, metrics, per-method throttling. |
| `AWS::Logs::LogGroup` | Access logs for the stage. |
| `AWS::ApiGateway::Account` | Only when `ManageApiGatewayAccount=true`. See §7. |

Current stack size: **12 endpoints → 84 resources**.

---

## 4. Adding an endpoint

This is the CLI's main job. It writes the registry entry, scaffolds the handler and regenerates
the template in one shot.

```bash
cd backend-code/auth

node cli/endpoint.js add \
    --path /auth/mfa/setup \
    --name mfa-setup \
    --authorizer cognito \
    --header X-Client-Id:required \
    --header X-Device-Id \
    --memory 512 \
    --description "Begin TOTP enrolment for the signed-in user"
```

```
added      POST /auth/mfa/setup (cognito)
scaffolded handlers/mfa-setup.js
generated  resources/auth_cloudformation.yml
```

Add `--dry-run` to see the registry entry and the resolved route without writing anything.

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--path` | *required* | `/auth/mfa/setup`. Path parameters (`/auth/user/{id}`) are supported. |
| `--method` | `POST` | GET, POST, PUT, PATCH, DELETE, HEAD. |
| `--authorizer` | `none` | `none` \| `cognito` \| `lambda` \| `iam`. See §5. |
| `--header` | — | Repeatable. `Name` (optional) or `Name:required`. |
| `--scope` | — | Repeatable. OAuth scopes; `cognito` authorizer only. |
| `--name` | last path segment | Drives the function name, log group and handler file. |
| `--handler` | `handlers/<name>.handler` | Override to point at an existing module. |
| `--memory` / `--timeout` | 256 MB / 15 s | Per-function overrides. |
| `--no-cors` | CORS on | Skips the OPTIONS preflight for that route. |
| `--api-key` | off | Requires an API key on the route. |

### Headers

`--header X-Client-Id:required` produces:

```yaml
RequestParameters:
  method.request.header.X-Client-Id: true      # true = required
RequestValidatorId:
  Ref: RequestParameterValidator
```

A required header is rejected by API Gateway with a 400 **before** the Lambda runs, so the
handler never has to check for it. Optional headers are declared but not enforced — declaring
them is still worth it because only declared headers can be mapped or cached on.

`Content-Type: required` is applied to every route from `defaults.headers` in the registry. If you
add a route that legitimately has no body (a GET, say), override it per-endpoint in
`config/endpoints.json`.

### Other commands

```bash
node cli/endpoint.js list                    # every route, with headers
node cli/endpoint.js show change-password    # one route + the CFN resources it produces
node cli/endpoint.js remove mfa-setup        # drop a route (handler file is left behind)
node cli/endpoint.js scaffold                # create handler files the registry expects
node cli/endpoint.js generate                # rewrite the template
node cli/endpoint.js generate --stdout       # print it instead
node cli/endpoint.js check                   # exit non-zero if the template is stale
```

From the `backend-code` directory these are also `npm run endpoints -- <args>`,
`npm run endpoints:list`, `npm run endpoints:check`, and so on.

---

## 5. Authorizers

| Value | Emits | Use for |
|---|---|---|
| `none` | `AuthorizationType: NONE` | Sign-up, sign-in, OTP, forgot/reset password, token refresh — anything the caller hits *before* they have an access token. |
| `cognito` | `COGNITO_USER_POOLS` + `AWS::ApiGateway::Authorizer` | Anything needing a signed-in user. API Gateway validates the JWT and puts the claims on `event.requestContext.authorizer.claims`. |
| `lambda` | `CUSTOM` (TOKEN authorizer) | Non-Cognito tokens, HMAC signatures, partner keys. Needs the `AuthorizerFunctionArn` parameter. |
| `iam` | `AWS_IAM` | Service-to-service calls signed with SigV4. |

The authorizer resources are only emitted when a route uses them, and the matching parameter
(`CognitoUserPoolArn`, `AuthorizerFunctionArn`) only appears when it is actually needed — so an
all-public API deploys without any Cognito wiring at all.

Choosing `cognito` or `lambda` automatically declares the `Authorization` header on the method,
because that is where the authorizer reads the token from.

Current split: **9 public** (signup, signin, verify-otp, resend-otp, forgot-password,
verify-reset-otp, reset-password, tokens, refresh) and **3 protected**
(change-password, delete-account, logout).

---

## 6. Deploying

```bash
cd backend-code/auth
cp config/.env.example config/.env.dev     # fill in region + pool ids
./deploy.sh --env dev
```

Or entirely from flags:

```bash
./deploy.sh --env dev --region ap-south-1 \
    --user-pool-id ap-south-1_AbCdEf123 \
    --client-id 1h57kf5cpq17m0eml12EXAMPLE
```

What it does, in order:

1. **Preflight** — checks `aws`, `node`, `zip`; resolves the account id and caller ARN.
2. **Generate** — rebuilds the template from the registry (skip with `--skip-generate`).
3. **Validate** — `aws cloudformation validate-template`.
4. **Package** — copies `handlers/ lib/ utils/` into a staging dir, installs prod dependencies if
   `package.json` exists, normalises every mtime, and zips deterministically. The same source
   always produces the same bytes, so a redeploy with no code change is a genuine no-op instead of
   replacing all twelve functions.
5. **Upload to S3** — key is `auth/<env>/auth-<sha12>.zip`. The bucket is created on first use with
   public access blocked, AES256 encryption and versioning on. If that exact key already exists,
   the upload is skipped.
6. **Deploy** — `aws cloudformation deploy` with `CAPABILITY_NAMED_IAM` and
   `--no-fail-on-empty-changeset`.
7. **Report** — prints the stack outputs and the `VITE_API_BASE_URL` line for the frontend.

Useful variants:

```bash
./deploy.sh --env dev --dry-run        # build + hash, touch nothing in AWS
./deploy.sh --env dev --package-only   # build + upload, no stack deploy
./deploy.sh --env prod --cors-origin https://app.example.com --log-retention 90
```

Settings resolve in this order: **command-line flag → `config/.env.<env>` → environment variable →
built-in default**.

---

## 7. Things that will bite you

**API Gateway's CloudWatch role is account-wide.** Stage access logging fails at create time
unless the account has a CloudWatch Logs role set. `deploy.sh` checks `apigateway get-account` and
flips `ManageApiGatewayAccount=true` only when nothing has set it, so the first stack in an account
creates the role and later stacks leave it alone. If you deploy the template by hand, set that
parameter yourself.

**The deployment hash is what publishes your change.** `AWS::ApiGateway::Deployment` is immutable;
CloudFormation will happily update methods without republishing the stage. The logical id embeds a
hash of the routes (`ApiDeployment664fe11cc51b`), so any route change creates a new deployment and
the stage moves to it. Change a *handler's code* and no new deployment is needed — the Lambda
update is enough.

**Log groups are created before the functions.** Each `AWS::Lambda::Function` has a `DependsOn` on
its log group. Without it Lambda creates the group itself on first invocation with never-expire
retention, and CloudFormation then fails on the next deploy with "log group already exists".

**Removing an endpoint leaves the handler file.** `remove` deliberately does not delete code. It
tells you which file is now orphaned; delete it yourself once you're sure.

**Deleting the stack deletes the log groups.** `DeletionPolicy: Delete` on the log groups is
intentional for dev. If you want prod logs to survive a stack teardown, change it to `Retain` in
`resources/template.js` (`buildLogGroup`) and regenerate.

**`CorsAllowOrigin` defaults to `*`.** Fine for dev, wrong for prod. Pass `--cors-origin` with the
real frontend origin. Note that `*` and credentialed requests are mutually exclusive in browsers.

---

## 8. Parameter reference

| Parameter | Default | Notes |
|---|---|---|
| `ProjectName` | `authplatform` | Prefix for every resource name. |
| `Environment` | `dev` | `dev` \| `staging` \| `prod`. |
| `ArtifactBucket` / `ArtifactKey` | — | Set by `deploy.sh`. |
| `CognitoUserPoolId` | — | Passed to handlers as `USER_POOL_ID`. |
| `CognitoUserPoolClientId` | — | Passed as `USER_POOL_CLIENT_ID`. |
| `CognitoUserPoolArn` | — | Only present when a route uses the `cognito` authorizer. |
| `CognitoClientSecretArn` | `''` | Optional. Non-empty grants `secretsmanager:GetSecretValue` on that one secret. |
| `AuthorizerFunctionArn` | — | Only present when a route uses the `lambda` authorizer. |
| `ApiStageName` | `v1` | First path segment of the invoke URL. |
| `CorsAllowOrigin` | `*` | See §7. |
| `LogRetentionInDays` | `30` | Applies to every log group in the stack. |
| `LogLevel` | `info` | `LOG_LEVEL` env var on every function. |
| `ThrottlingRateLimit` / `ThrottlingBurstLimit` | 50 / 100 | Per method. |
| `EnableXRayTracing` | `true` | Turns on active tracing and the matching IAM grants. |
| `ManageApiGatewayAccount` | `false` | See §7. |

### Outputs

`ApiInvokeUrl`, `RestApiId`, `StageName`, `LambdaExecutionRoleArn`, `ApiAccessLogGroupName`,
`DeployedArtifact`, `EndpointCount`. The first three are exported for cross-stack `Fn::ImportValue`.

`ApiInvokeUrl` is what the frontend needs:

```
VITE_API_BASE_URL=https://abc123.execute-api.ap-south-1.amazonaws.com/v1
```

The frontend service layer already posts to `${baseURL}/auth/signup` and friends, which lines up
with the paths in the registry.

---

## 9. Handler contract

Scaffolded handlers are API Gateway proxy handlers returning 501 until implemented:

```js
const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}
        // ...
        return json(200, { ok: true })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        return serverError()
    }
}
```

`utils/helpers.js` provides `json`, `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`,
`notFound`, `conflict`, `serverError`, `fromCognitoError` (maps Cognito exception names onto status
codes), `parseBody`, `missingField`, `bearerToken` and `claims`.

Every response carries `Access-Control-Allow-Origin` — API Gateway only answers the *preflight*;
the real response comes from Lambda and has to carry the CORS headers itself.

Environment variables available to every function: `PROJECT_NAME`, `ENVIRONMENT`, `LOG_LEVEL`,
`USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `CLIENT_SECRET_ARN`, `CORS_ALLOW_ORIGIN`.

---

## 10. Keeping the template honest

`node cli/endpoint.js check` exits non-zero when `auth_cloudformation.yml` no longer matches the
registry. To have CI enforce it, extend `backend-code/package.json`:

```json
"lint": "eslint . && node auth/cli/endpoint.js check"
```

The existing `.github/workflows/lint.yml` already runs `npm run lint` for `backend-code`, so no
workflow change is needed.
