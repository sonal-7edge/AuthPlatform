# Claude Code commands

Slash commands for adopting AuthPlatform in an application.

| Command | Does | Use when |
|---|---|---|
| `/provision-auth` | Steps 1–2: provisions Cognito with `auth-cli`, deploys the auth API | You have no auth API yet. Creates real AWS resources. |
| `/add-auth` | Step 3: installs and wires `@7edge/auth-client` into a React app | An auth API is already deployed and you have its URL. |

Most teams only need `/add-auth` — one person provisions the shared auth API
once, everyone else points at it.

## Using them in your own project

These live in the AuthPlatform repo, so they are only available to Claude Code
sessions started here. To use them in your application, copy them into it:

```bash
mkdir -p .claude/commands
cp /path/to/AuthPlatform/.claude/commands/add-auth.md .claude/commands/
```

Commit that file and every developer on the project gets `/add-auth`.

For all your projects at once, install them for your user instead:

```bash
cp /path/to/AuthPlatform/.claude/commands/*.md ~/.claude/commands/
```

Project commands win over user commands when both define the same name.

## Where the commands get their facts

**They do not need this repo checked out.** A project that copies `add-auth.md`
will not have `docs/` locally, so the commands fetch the guides over HTTP from
the public repo instead:

```
https://raw.githubusercontent.com/sonal-7edge/AuthPlatform/<branch>/docs/GETTING-STARTED.md
https://raw.githubusercontent.com/sonal-7edge/AuthPlatform/<branch>/auth-client/docs/INTEGRATION.md
```

The commands currently hardcode
`feature/CNE-440-publish-and-validate-deployment-and-integration-documentation`,
since that is the only ref serving these files today — `main` 404s. **When that
branch merges, change the branch segment to `main` in both command files.** It
is the one piece of maintenance these commands need.

That fetch is a convenience, not a dependency. Each command is self-contained
for the steps it performs, and also defers to documentation that **ships inside
the installed packages**:

| Source | Available |
|---|---|
| `node_modules/@7edge/auth-client/README.md` | after the frontend install — full API, screens, theming, troubleshooting |
| `src/auth/NEXT-STEPS.txt` | after the frontend install — what is still outstanding |
| `node_modules/@gprasad/auth-backend/README.md` + `docs/api-infrastructure.md` | after the backend install — routes, Cognito requirements, the SAM template |
| `auth --help`, `auth <cmd> --help` | after the CLI install |

That is why `auth-client`'s `package.json` ships `README.md` in its `files`
allowlist even though `docs/` is excluded: the README is the copy that reaches
consumers, so it has to stand alone.

The repo's longer guides (`docs/GETTING-STARTED.md`,
`auth-client/docs/INTEGRATION.md`) are richer, and the commands use them **when
they happen to be present** — but never block on them.

The one thing a command cannot defer is what to do *before* the install, since
no package docs exist yet. So `add-auth.md` carries the install command, the
`.env` handling and a hand-wiring fallback inline. Those are the parts to check
when something changes.

## Keeping them current

When behaviour changes, update the command in the same commit as the docs.
Things these commands assert that would break if they drifted:

- the package installs from a **git URL**, not npm (it is unpublished)
- **sign-in does not send an OTP** — a code is sent once, at sign-up
- auth-client **0.2.1+** is required against the current backend
- `npx auth-client setup` is what writes `.env` and the app wiring
- the wizard **always** generates a client secret, which breaks `/auth/refresh`

A quick check that a command is still honest: run it against a scratch app and
confirm every command it names actually exists and does what it claims.
