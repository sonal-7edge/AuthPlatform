#!/usr/bin/env node
/**
 * Runs after `npm install @7edge/auth-client`.
 *
 * It scaffolds `src/auth/` — mandatory, purely additive, the package's own
 * territory — then says so and points at the one command that finishes the
 * job. It asks nothing.
 *
 * It does not ask because an install hook cannot do it reliably. Two reasons,
 * both found the hard way:
 *
 *   · npm repaints the cursor's line for the whole install, about 40 times a
 *     second, erasing anything sharing it. That cannot be silenced from in
 *     here: --foreground-scripts does not stop it, spawnSync does not block
 *     it, and process.ppid is the shell npm spawned rather than npm itself.
 *   · the terminal's input buffer is not ours to consume. Shell prompt themes
 *     issue terminal queries whose replies arrive there as escape sequences,
 *     and reading one as an answer made the question cancel itself before the
 *     user had touched the keyboard.
 *
 * Writing is safe, though, and worth doing: npm hides a lifecycle script's
 * stdout unless --foreground-scripts is passed, so the notice goes to
 * /dev/tty, still the user's real terminal. Failing that it goes to stdout,
 * and either way it is left in the project as src/auth/NEXT-STEPS.txt.
 *
 * Rules this hook holds itself to:
 *  - It NEVER fails the install. Any error is swallowed, exit code is 0.
 *  - It never reads input, so it can never stall an install.
 *  - It never overwrites; existing files are left alone.
 *  - It touches nothing outside src/auth/.
 */

import { existsSync, writeFileSync, writeSync, openSync, closeSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { scaffoldAuth, recordStep, stepStatus, clearNote, TEMPLATES, ENV_KEY, pkg } from './scaffold.mjs'

const project = process.env.INIT_CWD
const tag = `[${pkg.name}]`

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}
const width = (line) => line.replace(/\x1b\[[0-9;]*m/g, '').length

function stop(reason) {
  if (process.env.AUTH_CLIENT_DEBUG) console.log(`${tag} skipped: ${reason}`)
  process.exit(0)
}

/**
 * Writes to the user's terminal, falling back to stdout.
 *
 * Ends on a blank line on purpose: npm's progress bar repaints whichever line
 * the cursor is on, so leaving the cursor below the message keeps the message
 * itself intact.
 */
function announce(text) {
  let fd
  try {
    fd = openSync('/dev/tty', 'w')
  } catch {
    process.stdout.write(text) // no terminal — NEXT-STEPS.txt carries it instead
    return
  }
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}

function box(lines) {
  const inner = Math.max(...lines.map(width)) + 2
  const pad = (line) => line + ' '.repeat(inner - width(line))
  const rule = '─'.repeat(inner + 1)
  return [
    '',
    c.dim(`  ╭${rule}╮`),
    ...lines.map((line) => `  ${c.dim('│')} ${pad(line)}${c.dim('│')}`),
    c.dim(`  ╰${rule}╯`),
    '',
    '',
  ].join('\n')
}

/**
 * npm hides this hook's stdout and there may be no terminal, so whatever is
 * outstanding is also recorded in the project. Rewritten every install so it
 * always describes the current state, and removed once nothing is left.
 */
function writeNote(status) {
  const pending = ['env', 'wire'].filter((step) => status[step] === 'pending')
  if (!pending.length) {
    clearNote({ project })
    return
  }

  const describe = {
    env: `  · .env         add ${ENV_KEY}                  — npx auth-client env`,
    wire: '  · app wiring   replace src/main.jsx + App.jsx  — npx auth-client wire',
  }

  writeFileSync(join(project, 'src', 'auth', 'NEXT-STEPS.txt'), [
    `${pkg.name} v${pkg.version}`,
    '',
    'src/auth/ is in place. Still to do:',
    '',
    ...pending.map((step) => describe[step]),
    '',
    'One command walks you through what is left:',
    '',
    '    npx auth-client setup',
    '',
    'It asks before each step and prints the manual equivalent if you decline.',
    'Undo the app wiring at any time with:  npx auth-client undo',
    '',
    'Delete this file once you are set up.',
    '',
  ].join('\n'))
}

try {
  if (!project) stop('no INIT_CWD (not a user-initiated install)')
  if (resolve(project) === resolve(join(TEMPLATES, '../..'))) stop('installing our own dependencies')
  if (project.split(sep).includes('node_modules')) stop('transitive install')
  if (!existsSync(join(project, 'package.json'))) stop('no package.json in INIT_CWD')
  if (!existsSync(TEMPLATES)) stop('build output not found')

  const { created, skipped } = scaffoldAuth({ project })
  recordStep({ project, step: 'auth', status: 'done' })

  const status = stepStatus({ project })
  const pending = ['env', 'wire'].filter((step) => status[step] === 'pending')
  const count = created.length + skipped.length

  announce(box(
    pending.length
      ? [
        `${c.green('✓')} ${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)} installed`,
        '',
        `  ${c.green('✓')} src/auth/ ${c.dim(`— ${count} files: screens, components, validation`)}`,
        `  ${c.dim('·')} .env, src/main.jsx, src/App.jsx ${c.dim('— not touched')}`,
        '',
        `${c.bold('  Next, run:')}`,
        `    ${c.cyan('npx auth-client setup')}`,
        c.dim('    asks before it changes .env, src/main.jsx or src/App.jsx'),
      ]
      : [
        `${c.green('✓')} ${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)} installed`,
        '',
        `  ${c.green('✓')} already set up — nothing left to do`,
        `    ${c.cyan('npx auth-client status')} ${c.dim('shows the current state')}`,
      ]
  ))

  writeNote(status)
  process.exit(0)
} catch (error) {
  announce(`\n${tag} could not scaffold automatically (${error.message}).\n${tag} run: npx auth-client setup\n\n`)
  process.exit(0)
}
