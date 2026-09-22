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
 * `npm install` runs `setup --from-install` on the controlling terminal (see
 * bin/postinstall.mjs), so the questions are part of the install itself. This
 * is the same path for anyone who skipped them, was in CI, or wants one step
 * on its own.
 *
 * Progress is recorded in src/auth/.auth-client.json as each answer is given,
 * so setup resumes at the step it stopped on rather than starting over. Note
 * that *reinstalling* does not resume: npm skips install hooks when nothing
 * changed, so `setup` is the way back in.
 */

import { createInterface } from 'node:readline/promises'
import { existsSync, readFileSync } from 'node:fs'

import { join } from 'node:path'
import {
  scaffoldAuth, writeEnv, wireApp, undoWiring, isWired,
  recordStep, stepStatus, clearNote,
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
 * One readline for the whole run, created on first use.
 *
 * Not one per question: closing an interface discards what it has buffered, so
 * a second question would lose input the user typed ahead.
 *
 * There is no time limit on an answer, and no raw-mode keypress reading. An
 * earlier version read single keypresses to survive `npm install`; it also
 * read the escape sequences that shell prompt themes leave in the terminal's
 * input buffer, and treated the leading \x1b as Esc — so the question
 * cancelled itself before the user touched anything. Prompting now only
 * happens here, where the terminal is ours and readline is the right tool.
 */
let readline = null
const prompt = () => (readline ??= createInterface({ input: process.stdin, output: process.stdout }))
function closePrompt() {
  readline?.close()
  readline = null
}

/**
 * Asks a yes/no question.
 *
 * @returns {Promise<boolean|null>} `null` means *unanswered* — not a terminal,
 * or the user hit Ctrl+C. Deliberately not the same as `false`: an unanswered
 * step stays pending so the next run resumes at it, whereas a "no" is
 * remembered and not asked again.
 */
async function confirm(question, { def = true } = {}) {
  if (has('--yes') || has('-y')) return true
  if (!process.stdin.isTTY) {
    console.log(`  ${c.yellow('·')} not a terminal — skipping "${question}"`)
    return null
  }
  try {
    const answer = (await prompt().question(`  ${question} ${c.dim(def ? '(Y/n)' : '(y/N)')} `)).trim().toLowerCase()
    if (!answer) return def
    return answer === 'y' || answer === 'yes'
  } catch {
    // Ctrl+C / Ctrl+D closes stdin mid-question: bail out cleanly rather than
    // crashing with a Node stack trace, and leave the step unanswered.
    console.log(`\n  ${c.yellow('·')} cancelled`)
    return null
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
function stepWire({ quiet = false } = {}) {
  const { written, backedUp } = wireApp({ project: PROJECT })
  backedUp.forEach((f) => skip(`backed up ${f}`))
  written.forEach((f) => ok(`wired ${f}`))
  // `setup` closes with a summary that covers undo; saying it twice is noise.
  if (!quiet) {
    console.log(c.dim(`    undo with ${cmd('npx auth-client undo')}`))
    if (backedUp.length) {
      console.log(c.dim('    the .bak files are yours to delete once you are happy'))
    }
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

// ── the closing summary ────────────────────────────────────────────────────

/** Visible width, ignoring the escape codes that make it colourful. */
const width = (line) => line.replace(/\x1b\[[0-9;]*m/g, '').length

/** Draws a rounded box sized to its widest line. */
function box(title, lines) {
  const inner = Math.max(width(title), ...lines.map(width)) + 2
  const pad = (line) => line + ' '.repeat(inner - width(line))
  const rule = '─'.repeat(inner + 1)

  console.log(c.dim(`  ╭${rule}╮`))
  console.log(`  ${c.dim('│')} ${pad(title)}${c.dim('│')}`)
  console.log(c.dim(`  ├${rule}┤`))
  for (const line of lines) console.log(`  ${c.dim('│')} ${pad(line)}${c.dim('│')}`)
  console.log(c.dim(`  ╰${rule}╯`))
}

/**
 * What just happened, what to do next, and how to put it back. Printed at the
 * end of `setup` because that is the one moment the user has the whole picture
 * in front of them — and the one moment they might want to undo it.
 *
 * @param {{ done: string[], skipped: string[], backups: string[] }} report
 */
function summary(report) {
  const state = stepStatus({ project: PROJECT })
  const left = ['env', 'wire'].filter((step) => state[step] !== 'done')

  const lines = []

  lines.push(c.bold('What changed'))
  report.done.forEach((line) => lines.push(`  ${c.green('✓')} ${line}`))
  report.skipped.forEach((line) => lines.push(`  ${c.yellow('·')} ${line}`))

  lines.push('')
  lines.push(c.bold('Next'))
  if (state.env === 'done') {
    lines.push(`  1  set ${c.cyan(ENV_KEY)} in .env ${c.dim('— it ships as a placeholder')}`)
    lines.push(`  2  ${c.cyan('npm run dev')}`)
  } else {
    lines.push(`  1  ${c.cyan('npx auth-client setup')} ${c.dim(`— ${left.join(' + ')} still to do`)}`)
    lines.push(`  2  set ${c.cyan(ENV_KEY)} in .env, then ${c.cyan('npm run dev')}`)
  }

  // Offer undo whenever a backup is sitting there, not just when this run made
  // one — on a resumed setup the wiring happened earlier but is just as undoable.
  const backups = ['src/main.jsx.bak', 'src/App.jsx.bak'].filter((f) => existsSync(join(PROJECT, f)))

  lines.push('')
  lines.push(c.bold('Undo'))
  if (backups.length) {
    lines.push(`  ${c.cyan('npx auth-client undo')}   ${c.dim('puts main.jsx + App.jsx back')}`)
    backups.forEach((file) => lines.push(c.dim(`    · ${file} — your original, kept until you delete it`)))
  } else {
    lines.push(`  ${c.cyan('npx auth-client undo')}   ${c.dim('nothing to undo — no .bak files')}`)
  }
  lines.push(`  ${c.cyan('npx auth-client status')} ${c.dim('what is done and what is left')}`)
  lines.push(c.dim('  src/auth/ is yours — editing or deleting it breaks nothing upstream'))

  // npm repaints the cursor's line for the whole install, so its progress bar
  // scrolls under the question. It cannot be silenced from in here, but the
  // user can turn it off on their side — worth mentioning once, afterwards,
  // where there is room to say it.

  console.log('')
  box(
    `${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}  ${left.length ? c.yellow('partly set up') : c.green('ready')}`,
    lines
  )
  console.log('')
}

// ── commands ───────────────────────────────────────────────────────────────
async function setup() {
  const report = { done: [], skipped: [], backups: [] }

  // Where the last run stopped. `--all` re-offers steps that were declined;
  // by default a "no" stays a no, so re-running is not a nag.
  const before = stepStatus({ project: PROJECT })
  const reoffer = has('--all')
  const wants = (step) => before[step] === 'pending' || (reoffer && before[step] === 'declined')
  const resuming = before.auth === 'done' && (before.env !== 'pending' || before.wire !== 'pending')

  header()

  if (resuming && (wants('env') || wants('wire'))) {
    const left = ['env', 'wire'].filter(wants)
    console.log(c.dim(`  Resuming — ${left.length} step${left.length > 1 ? 's' : ''} left: ${left.join(', ')}`))
  }

  const { created, skipped } = stepAuth({ quiet: true })
  recordStep({ project: PROJECT, step: 'auth', status: 'done' })
  // Normally `npm install` has already scaffolded it, so `created` is empty
  // and the interesting number is what is on disk.
  report.done.push(
    created.length
      ? `src/auth/ ${c.dim(`— ${created.length} files created`)}`
      : `src/auth/ ${c.dim(`— ${skipped.length} files already in place, left alone`)}`
  )
  console.log('')

  // ── .env ──────────────────────────────────────────────────────────────────
  if (!wants('env')) {
    if (before.env === 'done') report.done.push(`.env ${c.dim(`— ${ENV_KEY} already set, left alone`)}`)
    else report.skipped.push(`.env ${c.dim('— declined earlier, re-offer with --all')}`)
  } else {
    const envPath = join(PROJECT, '.env')
    const exists = existsSync(envPath)
    console.log(c.dim(`  ${ENV_KEY} tells the library which API to call.`))
    const answer = await confirm(exists ? 'Append the auth block to your existing .env?' : 'Create .env?', { def: true })

    if (answer === true) {
      const result = stepEnv()
      recordStep({ project: PROJECT, step: 'env', status: 'done' })
      report.done.push(`.env ${c.dim(`— ${result.action === 'appended' ? 'auth block appended, your other keys untouched' : 'created'}`)}`)
    } else if (answer === false) {
      // An explicit no is remembered, so re-running is not a nag.
      recordStep({ project: PROJECT, step: 'env', status: 'declined' })
      skip('.env not touched')
      manualEnv()
      report.skipped.push(`.env ${c.dim('— you said no; add it yourself or run `auth-client env`')}`)
    } else {
      // Unanswered — stays pending, so the next run resumes right here.
      skip('.env left for later — this step will be offered again')
      report.skipped.push(`.env ${c.dim('— left for later')}`)
    }
  }
  console.log('')

  // ── app wiring ────────────────────────────────────────────────────────────
  if (!wants('wire')) {
    if (before.wire === 'done') report.done.push(`src/App.jsx ${c.dim('— already imports ./auth, your wiring kept')}`)
    else report.skipped.push(`app wiring ${c.dim('— declined earlier, re-offer with --all')}`)
  } else {
    console.log(c.dim('  This REPLACES src/main.jsx and src/App.jsx (originals saved as .bak).'))
    const answer = await confirm('Wire them up now?', { def: false })

    if (answer === true) {
      const { backedUp } = stepWire({ quiet: true })
      recordStep({ project: PROJECT, step: 'wire', status: 'done' })
      report.done.push(`src/main.jsx ${c.dim('— imports the stylesheet')}`)
      report.done.push(`src/App.jsx ${c.dim('— home page: session panel, account actions')}`)
      report.backups = backedUp
    } else if (answer === false) {
      recordStep({ project: PROJECT, step: 'wire', status: 'declined' })
      skip('app files not touched')
      manualWire()
      report.skipped.push(`app wiring ${c.dim('— you said no; run `auth-client wire` to change your mind')}`)
    } else {
      skip('wiring left for later — this step will be offered again')
      report.skipped.push(`app wiring ${c.dim('— left for later')}`)
    }
  }

  if (clearNote({ project: PROJECT })) report.done.push(`removed NEXT-STEPS.txt ${c.dim('— nothing outstanding')}`)
  closePrompt()
  summary(report)
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
  case 'env':
    header(); stepEnv()
    recordStep({ project: PROJECT, step: 'env', status: 'done' })
    clearNote({ project: PROJECT }); console.log(''); break
  case 'wire':
    header(); stepWire()
    recordStep({ project: PROJECT, step: 'wire', status: 'done' })
    clearNote({ project: PROJECT }); console.log(''); break
  case 'undo': undo(); break
  case 'status': status(); break
  case undefined: case 'help': case '--help': case '-h': help(); break
  default:
    console.error(c.red(`Unknown command: ${command}`))
    help()
    process.exit(1)
}
