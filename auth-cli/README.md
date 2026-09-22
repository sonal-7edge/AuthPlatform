# auth-cli

Internal CLI tool for standardizing AWS Cognito resource provisioning.

`auth generate` runs an interactive wizard that collects authentication requirements, validates them, and writes a deployable CloudFormation template — no manual YAML authoring required. `auth add-client` reopens an existing config/template to add more app clients, `auth validate` checks a hand-edited `auth-config.yaml`, and `auth deploy` ships the generated template to AWS via `sam deploy`. The wizard mirrors the `cognito-panel` web UI step for step, so both tools produce the same shape of config from the same questions.

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

Both `auth generate` and `auth deploy` verify these credentials via AWS STS as their very first step — before the wizard runs, or before `sam deploy` is invoked — and print which account they resolved:

```
ℹ AWS Account: 123456789012 (arn:aws:iam::123456789012:user/akhilesh)
```

If no valid credentials are found, the command exits immediately with an error instead of proceeding.

---

## Usage

Run from any project directory:

```bash
cd my-project
auth generate
```

This runs the wizard and generates a `cognito-template.yaml` CloudFormation template in the current directory.

---

## Available Commands

### `auth generate`

Verifies your AWS credentials via STS first (see [Prerequisites for deploying](#prerequisites-for-deploying)), then runs the interactive wizard and generates a CloudFormation template for the Cognito User Pool, its app clients, and any Lambda triggers — no `auth-config.yaml` is written.

```bash
auth generate
auth generate --output ./infra/cognito-template.yaml
```

| Option | Description |
|---|---|
| `-o, --output <file>` | Output path for the CloudFormation template (default: `resources/auth/cognito-template.yaml`) |

Exits with code `1` and prints validation errors if the answers fail validation.

Once the template is written, you're asked whether to deploy it immediately. Answering yes prompts for a stack name and optional AWS profile, warns if no AWS credentials are exported in the current shell, and — after a final confirmation — runs `sam deploy` for you. Answering no just leaves the template on disk to deploy later with `auth deploy`.

### `auth add-client <file>`

Adds one or more app clients to an existing `auth-config.yaml` or generated `cognito-template.yaml`, then (re)writes the CloudFormation template with the new client(s) included. Reuses the same "add another app client?" prompt loop as step 6 of the wizard.

```bash
auth add-client ./auth-config.yaml
auth add-client ./resources/auth/cognito-template.yaml --output ./resources/auth/cognito-template.yaml
```

| Option | Description |
|---|---|
| `-o, --output <file>` | Output path for the updated CloudFormation template (default: overwrites the template in place, or writes alongside an `auth-config.yaml`) |

If the input file is an `auth-config.yaml`, it's updated and saved back to disk in addition to regenerating the template.

### `auth deploy <file>`

Verifies your AWS credentials via STS first — using `--profile` if given, otherwise the shell's exported credentials/`AWS_PROFILE` — then deploys a generated `cognito-template.yaml` with `sam deploy`. Requires the AWS SAM CLI installed (auto-installed on Linux if missing).

```bash
auth deploy ./resources/auth/cognito-template.yaml --stack-name my-app-users
auth deploy ./resources/auth/cognito-template.yaml -s my-app-users -p my-profile -r us-east-1
```

| Option | Description |
|---|---|
| `-s, --stack-name <name>` | CloudFormation stack name (required) |
| `-p, --profile <name>` | AWS CLI profile to use for credentials |
| `-r, --region <region>` | AWS region to deploy into (defaults to the profile/env region) |

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
auth generate --help
auth add-client --help
auth deploy --help
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
- **Password policy** — minimum length 6-20, temporary password validity 1-365 days. Any field left out of a hand-written `auth-config.yaml` (`minLength`, `requireUppercase`, `requireLowercase`, `requireNumbers`, `requireSymbols`, `tempPasswordDays`) defaults to the same values as the wizard: `8`, `true`, `true`, `true`, `false`, `7`
- **MFA** — at least one method required when MFA is enabled
- **App clients** — at least one client; each must include `ALLOW_REFRESH_TOKEN_AUTH`; token validity within AWS limits; callback/logout URLs must be valid URLs
- **Lambda triggers** — each ARN, if set, must match `arn:aws:lambda:REGION:ACCOUNT:function:NAME`

---

## Development

```bash
# Run in dev mode (no build required)
npm run dev -- generate
npm run dev -- validate

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

# Clean the dist/ output
npm run clean
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
│   ├── utils/            # File I/O, logger, CloudFormation generator, AWS identity check
│   │   ├── fileUtils.ts
│   │   ├── logger.ts
│   │   ├── awsIdentity.ts
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

---

## Publishing (npm)

`auth-cli` is published as the scoped public package [`@akhileshb/auth-cli`](https://www.npmjs.com/package/@akhileshb/auth-cli). `package.json` is already set up for this:

- `bin.auth` → `dist/index.js`, so a global install exposes the `auth` command
- `files: ["dist"]` → only compiled output ships, never `src/` or `tests/`
- `publishConfig.access: "public"` → required for a scoped package to publish publicly (scoped packages default to private/paid otherwise)
- `prepare` runs `npm run build` automatically before packing/publishing

### One-time setup

1. Have an npm account. The package scope (`@<your-npm-username>/...`) must match your own account — since it's your personal scope, no organization or extra setup is needed.
2. Log in from your machine:
   ```bash
   npm login
   ```
   This prompts for your username, password, email, and a one-time code if 2FA is enabled — then stores an auth token locally.
3. Confirm you're logged in as the right account:
   ```bash
   npm whoami
   ```

### Publishing a release

```bash
cd auth-cli

# 1. Make sure the working tree is clean and dist/ is fresh
npm run build

# 2. Sanity-check exactly what will be published
npm pack --dry-run

# 3. Bump the version (writes package.json + creates a git tag)
npm version patch   # or: minor / major

# 4. Publish
npm publish
```

- Use `npm version patch` for fixes, `minor` for backwards-compatible features, `major` for breaking changes (see [semver](https://semver.org)).
- `npm publish` re-runs `prepare` (and therefore `build`) automatically, so `dist/` is always rebuilt from current `src/` right before publishing.
- A version number can never be re-published once it's live — bump the version again and republish if something was wrong.

### Verifying the release

```bash
npm view @akhileshb/auth-cli
npm install -g @akhileshb/auth-cli
auth --help
```

### Publishing from CI (optional)

To publish automatically instead of from a local machine, add an `NPM_TOKEN` (an npm [automation/publish token](https://docs.npmjs.com/creating-and-viewing-access-tokens)) as a GitHub Actions secret, then run `npm publish` in a workflow triggered on a version tag or GitHub release, authenticating via:

```bash
npm config set //registry.npmjs.org/:_authToken=${NPM_TOKEN}
```
