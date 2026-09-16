/**
 * The three setup steps, each independent so the CLI can offer them
 * separately and the postinstall hook can run only the safe one.
 *
 *   scaffoldAuth()  copy src/auth/        — additive, never overwrites
 *   writeEnv()      create/append .env    — additive, never rewrites a value
 *   wireApp()       replace main/App.jsx  — DESTRUCTIVE, backs up first
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, renameSync,
  readdirSync, statSync, appendFileSync, unlinkSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * These files run from two layouts:
 *   source tree      bin/scaffold.mjs       -> ../dist/templates
 *   published repo   dist/bin/scaffold.mjs  -> ../templates
 * Resolve by looking for the templates rather than assuming a depth.
 */
export const TEMPLATES = [
  join(HERE, '../dist/templates'),
  join(HERE, '../templates'),
].find((candidate) => existsSync(join(candidate, 'env'))) ?? join(HERE, '../templates')

function findPackageRoot(from) {
  let dir = from
  for (let depth = 0; depth < 5; depth++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return from
}

export const PKG_ROOT = findPackageRoot(HERE)
export const ENV_KEY = 'VITE_API_BASE_URL'
export const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))

export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
}

function copyTree(from, to, project, force, created, skipped) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const source = join(from, entry)
    const target = join(to, entry)

    if (statSync(source).isDirectory()) {
      copyTree(source, target, project, force, created, skipped)
      continue
    }
    if (existsSync(target) && !force) {
      skipped.push(relative(project, target))
      continue
    }
    writeFileSync(target, readFileSync(source))
    created.push(relative(project, target))
  }
}

/**
 * Step 1 — the auth folder. Additive: an existing file is skipped unless
 * `force`, so a team's edits survive reinstalling.
 */
export function scaffoldAuth({ project, dir = 'src/auth', force = false }) {
  const created = []
  const skipped = []
  copyTree(join(TEMPLATES, 'auth'), resolve(project, dir), project, force, created, skipped)
  return { created, skipped, dir }
}

/**
 * Step 2 — the .env block. Creates the file, or appends to an existing one.
 * Never touches a value that is already set, and never rewrites other keys.
 */
export function writeEnv({ project }) {
  const envPath = join(project, '.env')
  const block = readFileSync(join(TEMPLATES, 'env'), 'utf8')

  if (!existsSync(envPath)) {
    writeFileSync(envPath, block.trimStart())
    return { action: 'created' }
  }

  const current = readFileSync(envPath, 'utf8')
  if (current.includes(ENV_KEY)) return { action: 'skipped', reason: `${ENV_KEY} already set` }

  appendFileSync(envPath, (current.endsWith('\n') ? '' : '\n') + block)
  return { action: 'appended' }
}

const WIRED = ['src/main.jsx', 'src/App.jsx']

/**
 * Step 3 — wire the app entry points. This REPLACES the project's own files,
 * so each is copied to `<name>.bak` first and `undo` puts them back.
 */
export function wireApp({ project }) {
  const written = []
  const backedUp = []

  for (const rel of WIRED) {
    const target = join(project, rel)
    const source = join(TEMPLATES, 'app', rel.replace('src/', ''))
    mkdirSync(dirname(target), { recursive: true })

    if (existsSync(target)) {
      renameSync(target, `${target}.bak`)
      backedUp.push(`${rel}.bak`)
    }
    writeFileSync(target, readFileSync(source))
    written.push(rel)
  }
  return { written, backedUp }
}

/** Reverses {@link wireApp} by restoring every .bak it left behind. */
export function undoWiring({ project }) {
  const restored = []
  const missing = []

  for (const rel of WIRED) {
    const target = join(project, rel)
    const backup = `${target}.bak`
    if (!existsSync(backup)) {
      missing.push(rel)
      continue
    }
    if (existsSync(target)) unlinkSync(target)
    renameSync(backup, target)
    restored.push(rel)
  }
  return { restored, missing }
}

/** True when this project already imports from the scaffolded auth folder. */
export function isWired({ project }) {
  const app = join(project, 'src/App.jsx')
  if (!existsSync(app)) return false
  return /from '\.\/auth'/.test(readFileSync(app, 'utf8'))
}

// ── where we left off ───────────────────────────────────────────────────────

/**
 * Setup can be interrupted — Ctrl+C at a prompt, a closed terminal, an install
 * that ran without a TTY. This file is how the next run knows which step to
 * resume from instead of starting over or re-asking what was already answered.
 *
 * It lives inside src/auth/ so it is covered by the folder we already own.
 */
export const STATE_FILE = 'src/auth/.auth-client.json'

export const STEPS = ['auth', 'env', 'wire']

export function readState({ project }) {
  try {
    return JSON.parse(readFileSync(join(project, STATE_FILE), 'utf8'))
  } catch {
    return { version: pkg.version, steps: {} }
  }
}

/**
 * Records one step's outcome immediately, so an interrupt keeps every answer
 * given before it. Never throws — losing the breadcrumb must not fail a run.
 */
export function recordStep({ project, step, status }) {
  try {
    const state = readState({ project })
    state.version = pkg.version
    state.steps = { ...state.steps, [step]: status }
    state.updatedAt = new Date().toISOString()
    mkdirSync(dirname(join(project, STATE_FILE)), { recursive: true })
    writeFileSync(join(project, STATE_FILE), JSON.stringify(state, null, 2) + '\n')
    return state
  } catch {
    return null
  }
}

/**
 * What still needs doing. The filesystem wins over the state file: if the work
 * is visibly present the step is done, whatever a stale or hand-edited record
 * claims. Deleting the state file therefore degrades gracefully rather than
 * re-running steps that already happened.
 *
 *   done      the work is there — never ask again
 *   declined  the user said no — don't nag, but `auth-client env` still works
 *   pending   never answered (fresh install, or interrupted mid-prompt)
 */
export function stepStatus({ project }) {
  const recorded = readState({ project }).steps ?? {}
  const envPath = join(project, '.env')

  const done = {
    auth: existsSync(join(project, 'src/auth/index.js')),
    env: existsSync(envPath) && readFileSync(envPath, 'utf8').includes(ENV_KEY),
    wire: isWired({ project }),
  }

  return Object.fromEntries(
    STEPS.map((step) => [step, done[step] ? 'done' : recorded[step] === 'declined' ? 'declined' : 'pending'])
  )
}

/**
 * Removes the reminder file once there is nothing left to remind about, so a
 * finished project is not left with stale instructions in it.
 */
export function clearNote({ project }) {
  const note = join(project, 'src/auth/NEXT-STEPS.txt')
  if (!existsSync(note)) return false
  const status = stepStatus({ project })
  if (STEPS.some((step) => status[step] === 'pending')) return false
  unlinkSync(note)
  return true
}

/** The first step still awaiting an answer, or null when there is nothing left. */
export function nextStep({ project }) {
  const status = stepStatus({ project })
  return STEPS.find((step) => status[step] === 'pending') ?? null
}
