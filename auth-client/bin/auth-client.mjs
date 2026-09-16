#!/usr/bin/env node
/**
 * @7edge/auth-client CLI.
 *
 *   npx auth-client setup     interactive — .env, then app wiring
 *   npx auth-client init      scaffold src/auth/ only (what install does)
 *   npx auth-client env       the .env step on its own
 *   npx auth-client wire      the app-wiring step on its own
 *   npx auth-client undo      restore main.jsx / App.jsx from backups
 *   npx auth-client status    what is done, declined or outstanding
 *
 * `npm install` asks the same questions over /dev/tty (see bin/tty.mjs), so
 * this is the path for anyone who skipped them, was in CI, or wants a single
 * step on its own. Both share the progress record in src/auth/.auth-client.json,
 * so setup resumes wherever the install left off — and vice versa.
 */

import { createInterface } from 'node:readline/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  scaffoldAuth, writeEnv, wireApp, undoWiring, isWired,
  recordStep, stepStatus,
  pkg, c, ENV_KEY, TEMPLATES,
} from './scaffold.mjs'

// npm sets INIT_CWD to the directory the command was run from.
const PROJECT = process.env.INIT_CWD || process.cwd()
const args = process.argv.slice(3)
const has = (flag) => args.includes(flag)
const flagValue = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : fallback
}

const ok = (s) => console.log(`  ${c.green('✓')} ${s}`)
const skip = (s) => console.log(`  ${c.yellow('·')} ${s}`)
const cmd = (s) => c.cyan(s)

/**
 * Asks a yes/no question.
 *
 * @returns {Promise<boolean|null>} `null` means *unanswered* — no terminal, or
 * the user hit Ctrl+C. That is deliberately not the same as `false`: an
 * unanswered step stays pending so the next run resumes at it, whereas a "no"
 * is remembered and not asked again.
 */
async function confirm(question, { def = true } = {}) {
  if (has('--yes') || has('-y')) return true
  if (!process.stdin.isTTY) {
    console.log(`  ${c.yellow('·')} not a terminal — skipping "${question}"`)
    return null
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`  ${question} ${c.dim(def ? '(Y/n)' : '(y/N)')} `)).trim().toLowerCase()
    if (!answer) return def
    return answer === 'y' || answer === 'yes'
  } catch {
    // Ctrl+C / Ctrl+D closes stdin mid-question. Bail out cleanly instead of
    // crashing with a Node stack trace, and leave the step unanswered.
    console.log(`\n  ${c.yellow('·')} cancelled`)
    return null
  } finally {
    rl.close()
  }
}

function header() {
  console.log(`\n${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}`)
  console.log(c.dim(`  project: ${PROJECT}\n`))
}

// ── step 1 · auth folder ───────────────────────────────────────────────────
function stepAuth({ force = false, dir = 'src/auth', quiet = false } = {}) {
  const { created, skipped } = scaffoldAuth({ project: PROJECT, dir, force })
  if (quiet) return { created, skipped }

  created.forEach((f) => ok(`created ${f}`))
  if (skipped.length) {
    skip(`${skipped.length} file(s) already existed and were left alone`)
    console.log(c.dim(`    overwrite them with ${cmd('npx auth-client init -- --force')}`))
  }
  return { created, skipped }
}

// ── step 2 · .env ──────────────────────────────────────────────────────────
function stepEnv() {
  const result = writeEnv({ project: PROJECT })
  if (result.action === 'created') ok('created .env')
  else if (result.action === 'appended') ok('appended the auth block to your existing .env')
  else skip(`.env left alone — ${result.reason}`)

  if (result.action !== 'skipped') {
    console.log(c.dim(`    now set ${ENV_KEY} to your API URL — it ships as a placeholder`))
  }
  return result
}

// ── step 3 · app wiring ────────────────────────────────────────────────────
function stepWire() {
  const { written, backedUp } = wireApp({ project: PROJECT })
  backedUp.forEach((f) => skip(`backed up ${f}`))
  written.forEach((f) => ok(`wired ${f}`))
  console.log(c.dim(`    undo with ${cmd('npx auth-client undo')}`))
  if (backedUp.length) {
    console.log(c.dim('    the .bak files are yours to delete once you are happy — nothing reads them but `undo`'))
  }
  return { written, backedUp }
}

function manualEnv() {
  console.log(c.dim('    to do it by hand, add to .env:'))
  console.log(c.dim(`      ${readFileSync(join(TEMPLATES, 'env'), 'utf8').trim().split('\n').join('\n      ')}`))
}

function manualWire() {
  console.log(c.dim('    to do it by hand:'))
  console.log(c.dim("      src/main.jsx  — add: import '@7edge/auth-client/style.css'"))
  console.log(c.dim("      src/App.jsx   — wrap your app in <AuthProvider config={authConfig}>"))
  console.log(c.dim(`      both templates: ${join(TEMPLATES, 'app')}`))
}

// ── commands ───────────────────────────────────────────────────────────────
async function setup() {
  header()

  // Where the last run stopped. `--all` re-offers steps that were declined;
  // by default a "no" stays a no, so re-running is not a nag.
  const before = stepStatus({ project: PROJECT })
  const reoffer = has('--all')
  const wants = (step) => before[step] === 'pending' || (reoffer && before[step] === 'declined')
  const resuming = before.auth === 'done' && (before.env !== 'pending' || before.wire !== 'pending')

  if (resuming && (wants('env') || wants('wire'))) {
    const left = ['env', 'wire'].filter(wants)
    console.log(c.dim(`  Resuming — ${left.length} step${left.length > 1 ? 's' : ''} left: ${left.join(', ')}\n`))
  }

  const { created } = stepAuth({ quiet: true })
  if (created.length) created.forEach((f) => ok(`created ${f}`))
  else skip('src/auth/ already present')
  recordStep({ project: PROJECT, step: 'auth', status: 'done' })
  console.log('')

  if (!wants('env')) {
    skip(before.env === 'done' ? `.env already defines ${ENV_KEY} — leaving it alone` : '.env declined earlier — re-offer with --all')
  } else {
    const envPath = join(PROJECT, '.env')
    const verb = existsSync(envPath) ? 'Append the auth block to your existing .env' : 'Create .env'
    console.log(c.dim(`  ${ENV_KEY} tells the library which API to call.`))
    const answer = await confirm(`${verb}?`, { def: true })
    if (answer === true) {
      stepEnv()
      recordStep({ project: PROJECT, step: 'env', status: 'done' })
    } else if (answer === false) {
      // An explicit no is remembered, so re-running is not a nag.
      recordStep({ project: PROJECT, step: 'env', status: 'declined' })
      skip('.env not touched')
      manualEnv()
    } else {
      // Unanswered — stays pending, so the next run resumes right here.
      skip('.env left for later — this step will be offered again')
      manualEnv()
    }
  }
  console.log('')

  if (!wants('wire')) {
    skip(before.wire === 'done' ? 'src/App.jsx already imports ./auth — leaving your wiring alone' : 'wiring declined earlier — re-offer with --all')
  } else {
    console.log(c.dim('  This REPLACES src/main.jsx and src/App.jsx (originals saved as .bak).'))
    const answer = await confirm('Wire them up now?', { def: false })
    if (answer === true) {
      stepWire()
      recordStep({ project: PROJECT, step: 'wire', status: 'done' })
    } else if (answer === false) {
      recordStep({ project: PROJECT, step: 'wire', status: 'declined' })
      skip('app files not touched')
      manualWire()
    } else {
      skip('wiring left for later — this step will be offered again')
      manualWire()
    }
  }

  console.log(`\n${c.bold('Done.')} ${c.dim(`Set ${ENV_KEY} in .env, then ${'npm run dev'}.`)}\n`)
}

/** Prints what is done, declined or still outstanding. */
function status() {
  header()
  const state = stepStatus({ project: PROJECT })
  const label = { auth: 'src/auth/ scaffold', env: `.env (${ENV_KEY})`, wire: 'src/main.jsx + App.jsx' }
  const mark = { done: c.green('✓'), declined: c.yellow('·'), pending: c.yellow('○') }
  for (const [step, value] of Object.entries(state)) {
    console.log(`  ${mark[value]} ${label[step].padEnd(26)} ${c.dim(value)}`)
  }
  const left = Object.entries(state).filter(([, v]) => v === 'pending').map(([k]) => k)
  console.log(left.length
    ? c.dim(`\n  Resume with ${cmd('npx auth-client setup')}\n`)
    : c.dim('\n  Nothing outstanding.\n'))
}

function undo() {
  header()
  const { restored, missing } = undoWiring({ project: PROJECT })
  restored.forEach((f) => ok(`restored ${f} from backup`))
  missing.forEach((f) => skip(`no backup for ${f} — nothing to restore`))
  if (!restored.length) console.log(c.dim('\n  Nothing to undo. Backups are only made by `auth-client wire`.'))
  console.log('')
}

function help() {
  console.log(`
${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}

  ${c.bold('npx auth-client setup')}   ${c.dim('interactive — .env, then app wiring')}
  ${c.bold('npx auth-client init')}    ${c.dim('scaffold src/auth/ only (what install does)')}
  ${c.bold('npx auth-client env')}     ${c.dim('the .env step on its own')}
  ${c.bold('npx auth-client wire')}    ${c.dim('replace main.jsx + App.jsx (backs them up)')}
  ${c.bold('npx auth-client undo')}    ${c.dim('restore main.jsx + App.jsx from backups')}
  ${c.bold('npx auth-client status')}  ${c.dim('what is done, declined or still outstanding')}

  Options
    --yes, -y       answer yes to every prompt
    --all           re-offer steps you declined earlier
    --force         overwrite existing files in src/auth/
    --dir <path>    where to scaffold          ${c.dim('(default: src/auth)')}

  ${c.dim('setup resumes: an interrupted step is offered again, a declined one is not.')}

  ${c.dim('Nothing outside src/auth/ is ever changed without a prompt.')}
`)
}

const [command] = process.argv.slice(2, 3)

switch (command) {
  case 'setup': await setup(); break
  case 'init': header(); stepAuth({ force: has('--force'), dir: flagValue('--dir', 'src/auth') }); console.log(''); break
  case 'env': header(); stepEnv(); console.log(''); break
  case 'wire': header(); stepWire(); console.log(''); break
  case 'undo': undo(); break
  case 'status': status(); break
  case undefined: case 'help': case '--help': case '-h': help(); break
  default:
    console.error(c.red(`Unknown command: ${command}`))
    help()
    process.exit(1)
}
