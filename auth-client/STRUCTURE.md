# Folder structure

What each folder in this repository is for, in plain words.

| Folder | In plain words |
|---|---|
| **`src/`** | The code you actually write. Everything else is generated from this. |
| `src/core/` | **The brain.** Talks to the server, stores tokens, refreshes them. Has no UI and doesn't know React exists — it would work in plain JavaScript. |
| `src/core/backends/` | How the client reaches the server, over HTTP. Kept as its own folder so an alternative transport can be dropped in without touching the rest of core. |
| `src/react/` | **The adapter** that makes the brain usable in React. Two files: one puts the client where components can reach it, one is the `useAuth()` hook. |
| `src/ui/` | The ready-made screens and their styling. |
| `src/ui/screens/` | The 7 full pages — Sign in, Sign up, OTP, Forgot password, Reset, Change password, Delete account. |
| `src/ui/components/` | The small reusable pieces the screens are built from — button, text field, password field with the eye toggle, alert banner. |
| **`templates/`** | The files copied into *someone else's* project on install. Only 3 here, hand-written. The 7 screens aren't — they're generated from `src/ui/`, so they can't fall out of sync. |
| **`bin/`** | The command-line side. What runs automatically after `npm install`, plus the `npx auth-client init` command. |
| **`scripts/`** | Your build, test and release tools. Not shipped to anyone. Generates the templates, assembles the publish repo, runs the 31 checks, and hosts the throwaway HTTP server those checks run against. |
| **`dist/`** | **The finished product** — the only thing consumers actually download. Rebuilt every time. Never edit by hand. |
| `node_modules/` | Downloaded dependencies. Ignore it. |

## Root files

| File | What it does |
|---|---|
| `package.json` | The manifest — name, what can be imported, what commands exist. |
| `vite.config.js` | Build settings for the JavaScript bundles. |
| `tailwind.config.js` | Design tokens and the CSS build. |
| `postcss.config.js` | Runs Tailwind and autoprefixer over the stylesheet. |
| `eslint.config.js` | Code style rules. |
| `README.md` | All the documentation — getting started, API, releasing. |
| `.gitignore` | What git leaves out, including `dist/`. |

## The one rule worth remembering

`src/`, `templates/`, `bin/` and `scripts/` are yours to edit.

`dist/` is written by the build. Anything you type in there is gone on the next
`npm run build`.

Two files share a name and only one is real:

| Path | |
|---|---|
| `templates/env` | the source — edit this |
| `dist/templates/env` | a build artifact — overwritten without warning |
