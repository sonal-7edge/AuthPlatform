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

## They read the docs, they do not replace them

Both commands instruct Claude to read `docs/GETTING-STARTED.md` and
`auth-client/docs/INTEGRATION.md` before acting, rather than relying on what the
model remembers about the package. That is deliberate: the install command, the
sign-in flow and the version pairing have all changed at least once, and a
command that hardcoded them would quietly go stale.

The practical consequence: **AuthPlatform needs to be reachable from wherever
the command runs.** If you copy `add-auth.md` into a project that does not sit
alongside this repo, the command tells Claude to ask you where the docs are
instead of guessing. Point it at a checkout, or paste the relevant guide.

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
