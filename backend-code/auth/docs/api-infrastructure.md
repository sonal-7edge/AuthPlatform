# Auth API Infrastructure — SAM template, adding endpoints, deploying

---

## 1. What's here

`template.yaml` is the entire infrastructure. Edit it directly — there is no generator, no
registry, no build step in between. Everything else under `auth/` is application code.

```
backend-code/                   ← npm root: run every command from here
├── package.json                one package for the whole backend
├── package-lock.json
├── node_modules/
├── eslint.config.mjs
├── jest.config.js
├── .lintstagedrc.json
└── auth/
    ├── template.yaml           the whole infrastructure — 15 functions, 16 log groups, 1 API, 1 IAM role
    ├── handlers/               one Lambda handler per route / Cognito trigger
    ├── lib/                    Cognito wrapper, OTP notifier, JWT verification, response helpers
    ├── utils/                  older response helpers, used by the not-yet-implemented stubs
    ├── docs/                   this file
    └── README.md
```

**`auth/` has no `package.json` of its own — dependencies belong to `backend-code/`.** That is why
`CodeUri` in the template is `../` and every `Handler` is `auth/handlers/<name>.handler`: SAM installs
production dependencies from the `package.json` *inside* `CodeUri`, so the build context has to be
`backend-code/`, and handler paths are resolved from there.

The practical consequence: **run `sam` from `backend-code/`, pointing at the template**:

```bash
cd backend-code
sam build -t auth/template.yaml --cached --parallel
```

Only the SAM CLI is needed to deploy. `sam build` uses your local Node 20 toolchain by default; add
`--use-container` if you need artifacts built against Amazon Linux exactly (requires Docker).

---

## 2. What the template creates

```
                         ┌──────────────────────────────┐
  client ──── HTTPS ───► │  AuthApi                     │  REGIONAL REST API, stage v1
                         │    POST /auth/signup      ───┼──► AWS_PROXY
                         │    OPTIONS  (SAM adds it) ───┼──► MOCK, CORS preflight
                         └───────────────┬──────────────┘
                                         │
                                         ▼
                         ┌──────────────────────────────┐
                         │  <Name>Function              │  arm64, Node 20, 256 MB, 15 s
                         │  authplatform-dev-signup     │
                         └───────────────┬──────────────┘
                                         │
                         ┌───────────────▼──────────────┐
                         │  <Name>LogGroup              │  /aws/lambda/<function name>
                         │  RetentionInDays: 30         │  declared FIRST — see §6
                         └──────────────────────────────┘
```

The three Cognito triggers are the same Function + LogGroup pair with **no `Events` block** — the
user pool invokes them directly, which the `AWS::Lambda::Permission` beside each one allows.

| Route | Handler | Auth | Status |
|---|---|---|---|
| `POST /auth/signup` | `handlers/sign_up.js` | public | implemented |
| `POST /auth/signin` | `handlers/sign_in.js` | public | implemented |
| `POST /auth/verify-otp` | `handlers/verify_otp.js` | public | implemented |
| `POST /auth/refresh` | `handlers/refresh_token.js` | public | implemented |
| `POST /auth/logout` | `handlers/logout.js` | cognito | implemented |
| `POST /auth/tokens` | `handlers/tokens.js` | public | 501 by design |
| `POST /auth/resend-otp` | `handlers/resend-otp.js` | public | 501 stub |
| `POST /auth/forgot-password` | `handlers/forgot-password.js` | public | 501 stub |
| `POST /auth/verify-reset-otp` | `handlers/verify-reset-otp.js` | public | 501 stub |
| `POST /auth/reset-password` | `handlers/reset-password.js` | public | 501 stub |
| `POST /auth/change-password` | `handlers/change-password.js` | cognito | 501 stub |
| `POST /auth/delete-account` | `handlers/delete-account.js` | cognito | 501 stub |

| Cognito trigger | Handler |
|---|---|
| `DefineAuthChallenge` | `handlers/define_auth_challenge.js` |
| `CreateAuthChallenge` | `handlers/create_auth_challenge.js` |
| `VerifyAuthChallengeResponse` | `handlers/verify_auth_challenge_response.js` |

The four snake_case handlers are deliberate: the implemented code lives in `sign_up.js`,
`sign_in.js`, `verify_otp.js` and `refresh_token.js`, while `signup.js`, `signin.js`,
`verify-otp.js` and `refresh.js` are older 501 scaffolds the template no longer points at. They are
dead code and safe to delete.

Once per stack: the shared `LambdaExecutionRole`, the API access log group, two
`AWS::ApiGateway::GatewayResponse` resources (so 4XX/5XX raised by API Gateway itself still carry
CORS headers), and an `AWS::ApiGateway::Account` that only appears when
`ManageApiGatewayAccount=true`.

---

## 3. Adding an endpoint

### Step 1 — write the handler

`handlers/my-thing.js`:

```js
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

module.exports.handler = withErrorHandling(async (event) => {
    const body = parseBody(event)
    if (!body?.something) return badRequest('something is required')

    return ok({ message: 'done' })
})
```

`withErrorHandling` maps Cognito exception names onto the right HTTP status, so you only write the
happy path. `lib/helpers.js` has `ok`, `badRequest`, `unauthorized`, `notFound`, `serverError`,
`parseBody`, `resolveIdentifier`, `getHeader`.

### Step 2 — add two resources to `template.yaml`

Paste into the ROUTES section:

```yaml
  MyThingLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${ProjectName}-${Environment}-my-thing
      RetentionInDays: !Ref LogRetentionInDays

  MyThingFunction:
    Type: AWS::Serverless::Function
    DependsOn: MyThingLogGroup
    Properties:
      FunctionName: !Sub ${ProjectName}-${Environment}-my-thing
      Description: What this endpoint does
      Handler: auth/handlers/my-thing.handler
      Events:
        Post:
          Type: Api
          Properties:
            RestApiId: !Ref AuthApi
            Path: /auth/my-thing
            Method: post
```

Exactly five values change between blocks:

| | |
|---|---|
| `MyThingLogGroup` / `MyThingFunction` | the two logical ids — must match the `DependsOn` |
| `LogGroupName` suffix | `-my-thing` |
| `FunctionName` suffix | `-my-thing` |
| `Handler` | `auth/handlers/my-thing.handler` — note the `auth/` prefix |
| `Path` | `/auth/my-thing` |

Runtime, architecture, memory, timeout, IAM role, tracing and every environment variable come from
`Globals` at the top of the template. A new endpoint repeats none of it.

### Step 3 — deploy

```bash
cd backend-code
sam validate -t auth/template.yaml --lint
sam build -t auth/template.yaml --cached --parallel
sam deploy
```

`sam deploy` needs no `-t`: it deploys what `sam build` left in `.aws-sam/build`.

### Variations

**Require a signed-in user** — add `Auth` under the event's `Properties`:

```yaml
            Auth:
              Authorizer: CognitoAuthorizer
```

API Gateway then validates the JWT itself and puts the claims on
`event.requestContext.authorizer.claims`. A public route simply has no `Auth` block — do **not**
write `Authorizer: NONE`, which SAM rejects unless the API declares a `DefaultAuthorizer`.

**Non-POST method, or different limits:**

```yaml
      MemorySize: 512
      Timeout: 30
      Events:
        Get:
          Type: Api
          Properties:
            RestApiId: !Ref AuthApi
            Path: /auth/my-thing
            Method: get
```

If you introduce a verb other than POST, add it to the API's `Cors.AllowMethods` — the preflight
response advertises only what's listed there.

**Path parameter** — `Path: /auth/user/{id}`, read as `event.pathParameters.id`.

**A new Cognito trigger** — same as a route, but drop the whole `Events` block and add a permission:

```yaml
  MyTriggerPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !GetAtt MyTriggerFunction.Arn
      Principal: cognito-idp.amazonaws.com
      SourceArn: !Ref CognitoUserPoolArn
```

Then attach it to the pool's LambdaConfig — see §5.

### The two mistakes `--lint` won't catch

Both are valid CloudFormation, so only a careful read finds them:

- a `LogGroupName` or `FunctionName` suffix you forgot to change — two functions then fight over one
  log group, and the deploy fails with "log group already exists"
- a `DependsOn` still naming the log group you copied from

---

## 4. Testing locally

```bash
cd backend-code
npm install          # handlers need the AWS SDK on disk
sam build -t auth/template.yaml --cached --parallel
```

`sam local` needs the same environment variables the stack sets. Put them in a JSON file — the
`Parameters` key applies to every function:

```bash
cat > /tmp/auth-env.json <<'EOF'
{
  "Parameters": {
    "COGNITO_USER_POOL_ID": "ap-south-1_AbCdEf123",
    "COGNITO_CLIENT_ID": "1h57kf5cpq17m0eml12EXAMPLE",
    "COGNITO_CLIENT_SECRET": "",
    "SES_FROM_EMAIL": "no-reply@example.com",
    "OTP_TTL_SECONDS": "300",
    "CORS_ALLOW_ORIGIN": "*",
    "LOG_LEVEL": "debug"
  }
}
EOF
```

### The whole API on localhost

```bash
sam local start-api --port 3000 --env-vars /tmp/auth-env.json

curl -s localhost:3000/auth/signup -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"Str0ng-Passw0rd!"}'
```

### One function at a time

Use the logical id from `template.yaml`, and pipe the event in on stdin:

```bash
# API route — sam can generate the proxy envelope for you
sam local generate-event apigateway aws-proxy --method POST --path auth/signin \
    --body '{"email":"ada@example.com","password":"Str0ng-Passw0rd!"}' \
  | sam local invoke SigninFunction --event - --env-vars /tmp/auth-env.json

# DefineAuthChallenge — pure logic, no AWS calls, expects challengeName CUSTOM_CHALLENGE back
echo '{"request":{"session":[{"challengeResult":true,"challengeMetadata":"PASSWORD_VERIFIER"}]},"response":{}}' \
  | sam local invoke DefineAuthChallengeFunction --event -

# VerifyAuthChallengeResponse, OTP round — otp_hash is sha256('123456'), also no AWS calls
echo '{"userName":"ada@example.com","request":{"privateChallengeParameters":{"otp_hash":"8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"},"challengeAnswer":"123456"},"response":{}}' \
  | sam local invoke VerifyAuthChallengeFunction --event -
```

Those last two are the fastest things here to iterate on — no AWS account touched at all. Everything
else calls real Cognito/SES/SNS with your credentials, so point the env file at a throwaway dev pool,
never a shared one.

### Logs from a deployed stack

```bash
sam logs --stack-name authplatform-dev-auth --name SignupFunction --tail
sam logs --stack-name authplatform-dev-auth --name SignupFunction --start-time '10min ago'
```

Function log groups are `/aws/lambda/<project>-<env>-<name>` at 30-day retention. The API stage
writes JSON access logs to `/aws/apigateway/<project>-<env>-auth`.

### Fast redeploy loop

```bash
sam sync --stack-name authplatform-dev-auth --watch --code
```

`--code` pushes handler changes straight to Lambda with no CloudFormation update. Dev only — it
deliberately skips the changeset.

---

## 5. Deploying

Everything runs from `backend-code/`:

```bash
cd backend-code
sam validate -t auth/template.yaml --lint
sam build -t auth/template.yaml --cached --parallel
sam deploy --guided          # first time: prompts, then saves to samconfig.toml
```

`samconfig.toml` is gitignored because `--guided` writes your pool ids into it. After that first run,
redeploys are just `sam build -t auth/template.yaml --cached --parallel && sam deploy`.

Fully explicit, no saved config:

```bash
sam deploy \
  --stack-name authplatform-dev-auth \
  --region ap-south-1 \
  --capabilities CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --no-fail-on-empty-changeset \
  --tags Project=authplatform Environment=dev \
  --parameter-overrides \
    Environment=dev \
    CognitoUserPoolId=ap-south-1_AbCdEf123 \
    CognitoUserPoolArn=arn:aws:cognito-idp:ap-south-1:111122223333:userpool/ap-south-1_AbCdEf123 \
    CognitoUserPoolClientId=1h57kf5cpq17m0eml12EXAMPLE \
    SesFromEmail=no-reply@example.com
```

`--resolve-s3` lets SAM create and reuse its own artifact bucket; swap in
`--s3-bucket <name> --s3-prefix auth/dev` to use your own. `CAPABILITY_NAMED_IAM` is required
because the execution role has an explicit `RoleName`.

Prod, roughly:

```bash
  --parameter-overrides \
    Environment=prod \
    CorsAllowOrigin=https://app.example.com \
    LogRetentionInDays=90 \
    ...
```

Preview without applying:

```bash
sam deploy --no-execute-changeset   # builds the changeset, prints it, executes nothing
sam deploy --confirm-changeset      # prints it, then asks
```

### First deploy in a fresh AWS account

API Gateway stores its CloudWatch Logs role **per account and region**, not per stack. If nothing has
ever set it, the stage's access logging fails at create time. Check:

```bash
aws apigateway get-account --region ap-south-1 --query cloudwatchRoleArn
```

If that returns `None` or empty, add `ManageApiGatewayAccount=true` to the parameter overrides for
the first deploy so this stack creates the role. Leave it at the default `false` afterwards, and in
any account where another stack already owns it.

### Attaching the Cognito triggers

The stack creates the three trigger functions and grants the pool permission to invoke them, but it
does **not** modify the pool. That's deliberate: `update-user-pool` is a full replace, so calling it
with only `--lambda-config` silently wipes every other pool setting — password policy, MFA, schema.

Get the ARNs:

```bash
aws cloudformation describe-stacks --stack-name authplatform-dev-auth \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaConfigForUserPool`].OutputValue' --output text
```

Then either set the three triggers in the Cognito console (simplest, and safe), or merge that JSON
into `describe-user-pool`'s output before calling `update-user-pool`.

**Until they're attached, `CUSTOM_AUTH` sign-in cannot work** — signup, signin and verify-otp all
fail. The pool also needs the explicit auth flows `ALLOW_CUSTOM_AUTH`,
`ALLOW_ADMIN_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`.

### Tearing down

```bash
sam delete --stack-name authplatform-dev-auth
```

This deletes the log groups too — see §6.

---

## 6. Things that will bite you

**The pending-OTP store is in-memory, and the handlers are separate functions.**
`lib/challengeSessionStore.js` holds the Cognito `Session` string between `/auth/signin` (which
starts the challenge) and `/auth/verify-otp` (which completes it) in a module-level `Map`. Those are
two different Lambda functions in two different containers, so `verify-otp` never sees what `signin`
wrote and always answers *"No pending verification for this identifier"*. This is an application gap
that predates the template, not a deployment problem. The flow needs a shared store — a DynamoDB
table with a TTL attribute is the natural fit, and the store's `{get, set, delete}` shape is already
designed for the swap.

**Required headers are not enforced at the edge.** `AWS::Serverless::Api` exposes no
request-validator property, so validate in the handler. An earlier raw-CloudFormation version of this
stack attached an `AWS::ApiGateway::RequestValidator` and rejected a missing `Content-Type` with a
400 before Lambda ran; that behaviour is gone. Getting it back means hand-authoring an OpenAPI
`DefinitionBody` with `x-amazon-apigateway-request-validators`.

**Log groups are declared before the functions.** Each function has `DependsOn` on its log group.
Without it Lambda creates the group itself on first invocation with never-expire retention, and the
next deploy fails with "log group already exists".

**Function names are explicit, on purpose.** SAM would otherwise generate them, and the log group
names could not be declared up front. The cost: renaming an endpoint replaces the function rather
than updating it.

**Deleting the stack deletes the log groups.** Fine for dev. For prod, add
`DeletionPolicy: Retain` to the log group resources.

**`CorsAllowOrigin` defaults to `*`.** Wrong for prod — override it. Note that `*` and credentialed
requests are mutually exclusive in browsers.

**`CodeUri: ../` packages all of `backend-code/`.** Because dependencies live at
`backend-code/package.json`, the build context is that whole directory — so every Lambda artifact
carries `auth/docs/`, `jest.config.js` and `eslint.config.mjs` alongside the handlers, and adding a
second service under `backend-code/` would put its code in these functions too. Harmless at this
size. If it ever matters, switch the functions to `Metadata: { BuildMethod: esbuild }`, which bundles
only what each handler actually imports.

**`sam build` runs once per function.** All fifteen share one `CodeUri`, so without `--cached` SAM
repeats the same `npm install` fifteen times. Always pass `--cached --parallel`.

---

## 7. Parameters

| Parameter | Default | Notes |
|---|---|---|
| `ProjectName` | `authplatform` | Prefix for every resource name. |
| `Environment` | `dev` | `dev` \| `staging` \| `prod`. |
| `ApiStageName` | `v1` | First path segment of the invoke URL. |
| `CognitoUserPoolId` | *required* | Reaches handlers as `COGNITO_USER_POOL_ID`. |
| `CognitoUserPoolArn` | *required* | Used twice: the API's Cognito authorizer, and the triggers' invoke permissions. |
| `CognitoUserPoolClientId` | *required* | Reaches handlers as `COGNITO_CLIENT_ID`. |
| `CognitoClientSecret` | `''` | `NoEcho`. The literal secret — `lib/Cognito.js` computes `SECRET_HASH` from it, so an ARN would not do. Empty for a public app client. |
| `SesFromEmail` | `''` | Verified SES sender. Email OTPs fail without it. |
| `OtpTtlSeconds` | `300` | `OTP_TTL_SECONDS`. |
| `CorsAllowOrigin` | `*` | See §6. |
| `LogRetentionInDays` | `30` | Every log group in the stack. |
| `LogLevel` | `info` | `LOG_LEVEL` on every function. |
| `ThrottlingRateLimit` / `ThrottlingBurstLimit` | 50 / 100 | Per method. |
| `EnableXRayTracing` | `true` | Active tracing plus the matching IAM grants. |
| `ManageApiGatewayAccount` | `false` | See §5. |

### Outputs

| Output | Use |
|---|---|
| `ApiInvokeUrl` | `VITE_API_BASE_URL=https://abc123.execute-api.ap-south-1.amazonaws.com/v1` |
| `RestApiId` | Cross-stack reference. |
| `StageName` | Deployed stage. |
| `LambdaExecutionRoleArn` | Cross-stack reference. |
| `ApiAccessLogGroupName` | Where the stage's access logs land. |
| `UsingClientSecret` | `yes`/`no` — quick check that `SECRET_HASH` will be computed. |
| `LambdaConfigForUserPool` | The trigger ARNs to attach to the pool. See §5. |

`ApiInvokeUrl`, `RestApiId` and `LambdaExecutionRoleArn` are exported for `Fn::ImportValue`.

The frontend service layer already posts to `${baseURL}/auth/signup` and friends, which lines up
with the paths in the template.

---

## 8. Environment variables

Set once in `Globals.Function.Environment.Variables`, so every function gets all of them:

| Variable | From parameter | Read by |
|---|---|---|
| `COGNITO_USER_POOL_ID` | `CognitoUserPoolId` | `lib/Cognito.js`, `lib/verifyIdToken.js` |
| `COGNITO_CLIENT_ID` | `CognitoUserPoolClientId` | `lib/Cognito.js`, `lib/verifyIdToken.js` |
| `COGNITO_CLIENT_SECRET` | `CognitoClientSecret` | `lib/Cognito.js` (`SECRET_HASH`) |
| `SES_FROM_EMAIL` | `SesFromEmail` | `lib/notifier.js` |
| `OTP_TTL_SECONDS` | `OtpTtlSeconds` | `lib/otpChallenge.js`, `handlers/verify_otp.js` |
| `CORS_ALLOW_ORIGIN` | `CorsAllowOrigin` | `utils/helpers.js` |
| `LOG_LEVEL`, `PROJECT_NAME`, `ENVIRONMENT` | matching parameters | — |
| `NODE_OPTIONS` | literal `--enable-source-maps` | — |

`AWS_REGION` is supplied by the Lambda runtime.

Adding a variable means two edits: the `Globals` block (and a `Parameters` entry if it's
configurable), and your local `--env-vars` file for `sam local`. Keep them in step, or a handler will
work locally and fail deployed.
