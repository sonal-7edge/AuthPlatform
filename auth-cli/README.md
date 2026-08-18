# auth-cli

Internal CLI tool for standardizing AWS Cognito resource provisioning.

`auth init` collects authentication requirements interactively and generates a validated `auth-config.yaml` file. `auth generate` turns that file into a deployable CloudFormation template. The wizard mirrors the `cognito-panel` web UI step for step, so both tools produce the same shape of config from the same questions.

---

## Installation

```bash
cd auth-cli
npm install
npm run build
npm install -g .
```

After global install the `auth` binary is available system-wide.

### Prerequisites for deploying

`auth generate` and `auth deploy` shell out to the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) (`sam deploy`), not the plain AWS CLI. Install it separately and confirm it's on your `PATH`:

```bash
sam --version
```

Before deploying, export AWS credentials into the same terminal session (or set `AWS_PROFILE` / pass `--profile`):

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # only if using temporary/SSO credentials
```

---

## Usage

Run from any project directory:

```bash
cd my-project
auth init
auth generate
```

This generates `auth-config.yaml` and then a `cognito-template.yaml` CloudFormation template in the current directory.

---

## Available Commands

### `auth init`

Starts the interactive wizard. Asks a series of questions and writes `auth-config.yaml` to the current directory (or a custom output directory with `--output`).

```bash
auth init
auth init --output ./config
```

### `auth generate`

Runs the interactive wizard and generates a CloudFormation template for the Cognito User Pool, its app clients, and any Lambda triggers — no `auth-config.yaml` is written.

```bash
auth generate
auth generate --output ./infra/cognito-template.yaml
```

Exits with code `1` and prints validation errors if the answers fail validation.

Once the template is written, you're asked whether to deploy it immediately. Answering yes prompts for a stack name and optional AWS profile, warns if no AWS credentials are exported in the current shell, and — after a final confirmation — runs `sam deploy` for you. Answering no just leaves the template on disk to deploy later with `auth deploy`.

### `auth deploy <file>`

Deploys a generated `cognito-template.yaml` with `sam deploy`. Requires AWS credentials exported in the shell (or `--profile`/`AWS_PROFILE`) and the AWS SAM CLI installed.

```bash
auth deploy ./resources/auth/cognito-template.yaml --stack-name my-app-users
auth deploy ./resources/auth/cognito-template.yaml -s my-app-users -p my-profile -r us-east-1
```

### `auth validate [file]`

Validates an existing `auth-config.yaml`. Defaults to `auth-config.yaml` in the current directory.

```bash
auth validate
auth validate ./config/auth-config.yaml
```

Exits with code `0` on success, `1` on failure.

### `auth --help`

Shows all commands and options.

```bash
auth --help
auth init --help
auth generate --help
auth validate --help
```

---

## Interactive Questions

The wizard asks questions in eight steps, matching the `cognito-panel` UI:

| Step | Question | Type | Notes |
|---|---|---|---|
| 1. Cloud Provider | Cloud Provider | Select | `aws` (only supported provider today; azure/gcp coming soon) |
| | AWS Region | Select | one of 17 AWS regions |
| 2. User Pool | User Pool Name | Text | must be unique in your account/region |
| | Allow self-registration? | Confirm | default yes |
| | Auto-verify email addresses? | Confirm | default yes |
| 3. Sign-in | Sign-in options | Multi-select | email / phone / username, at least 1, locked after pool creation |
| 4. Password Policy | Minimum length | Number (6-20) | default 8 |
| | Require uppercase / lowercase / numbers / symbols | Confirm | defaults yes/yes/yes/no |
| | Temporary password validity (days) | Number (1-365) | default 7 |
| 5. MFA | MFA enforcement | Select | Disabled / Optional / Required |
| | Allowed MFA methods | Multi-select | TOTP / SMS, only asked if MFA is enabled |
| 6. App Clients (repeatable) | Client name | Text | default `web-client`, then `client-N` |
| | Generate client secret? | Confirm | default no |
| | Auth flows | Multi-select | SRP / User+Password / Custom Auth / Admin Password Auth (Refresh Token is always included) |
| | Access / ID token validity | Number (minutes, max 1440) | default 60 each |
| | Refresh token validity | Number (days, max 3650) | default 30 |
| | Callback URLs / Logout URLs | Repeated text | add as many as needed, blank to finish |
| | Add another client? | Confirm | loops back to the top of step 6 |
| 7. Lambda Triggers | 10 trigger ARNs | Text (all optional) | Pre Sign-up, Post Confirmation, Pre Authentication, Post Authentication, Custom Message, Pre Token Generation, User Migration, Define/Create/Verify Auth Challenge |
| 8. Review | — | — | printed summary before writing `auth-config.yaml` |

---

## Example Output

```yaml
provider: aws
region: us-east-1
poolName: my-app-users
selfSignup: true
emailVerification: true
signInOptions:
  - email
passwordPolicy:
  minLength: 8
  requireUppercase: true
  requireLowercase: true
  requireNumbers: true
  requireSymbols: false
  tempPasswordDays: 7
mfa:
  enabled: false
  mode: "off"
  methods: []
appClients:
  - name: web-client
    generateSecret: false
    authFlows:
      - ALLOW_USER_SRP_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
    accessTokenValidity: 60
    idTokenValidity: 60
    refreshTokenValidity: 30
    callbackUrls: []
    logoutUrls: []
lambdaTriggers:
  preSignUp: ""
  postConfirmation: ""
  preAuthentication: ""
  postAuthentication: ""
  customMessage: ""
  preTokenGeneration: ""
  userMigration: ""
  defineChallenge: ""
  createChallenge: ""
  verifyChallenge: ""
```

---

## Validation Rules

- **Provider** — only `aws` is currently supported
- **Region** — must be one of the 17 supported AWS regions
- **User Pool Name** — required; letters, numbers, hyphens, and underscores only
- **Sign-in options** — at least one of `email`, `phone`, `username`
- **Password policy** — minimum length 6-20, temporary password validity 1-365 days
- **MFA** — at least one method required when MFA is enabled
- **App clients** — at least one client; each must include `ALLOW_REFRESH_TOKEN_AUTH`; token validity within AWS limits; callback/logout URLs must be valid URLs
- **Lambda triggers** — each ARN, if set, must match `arn:aws:lambda:REGION:ACCOUNT:function:NAME`

---

## Development

```bash
# Run in dev mode (no build required)
npm run dev -- init
npm run dev -- generate

# Type-check
npx tsc --noEmit

# Lint
npm run lint

# Format
npm run format

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

---

## Folder Structure

```
auth-cli/
├── src/
│   ├── commands/         # Commander.js command registrations
│   │   ├── generateCommand.ts
│   │   ├── addClientCommand.ts
│   │   ├── deployCommand.ts
│   │   └── validateCommand.ts
│   ├── prompts/          # Inquirer.js prompt definitions
│   │   └── authPrompts.ts
│   ├── validators/       # Zod-based validation logic
│   │   └── configValidator.ts
│   ├── models/           # Zod schemas
│   │   └── authConfigSchema.ts
│   ├── utils/            # File I/O, logger, CloudFormation generator
│   │   ├── fileUtils.ts
│   │   ├── logger.ts
│   │   └── cfnGenerator.ts
│   ├── services/         # Business logic
│   │   ├── IConfigService.ts
│   │   └── configService.ts
│   ├── types/            # TypeScript types/interfaces
│   │   └── index.ts
│   ├── config/           # Constants and static config
│   │   └── constants.ts
│   └── index.ts          # CLI entry point
├── tests/
│   ├── validators.test.ts
│   ├── configService.test.ts
│   ├── prompts.test.ts
│   └── cfnGenerator.test.ts
├── generated/            # Output directory (gitignored in projects)
├── package.json
├── tsconfig.json
└── README.md
```
