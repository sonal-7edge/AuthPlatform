#!/usr/bin/env node
/**
 * Runs after `npm install @7edge/auth-client`.
 *
 * It does exactly one thing: scaffold `src/auth/`, which is additive and is
 * the package's own territory. Anything that touches a file the project owns
 * (.env, main.jsx, App.jsx) waits for `npx auth-client setup`.
 *
 * It does NOT ask questions here. /dev/tty makes that technically possible —
 * npm's own stdio is piped, but the controlling terminal is still reachable —
 * and it works with piped input. With a real person at a real terminal it does
 * not: npm is also reading that tty and drawing its progress bar over the
 * prompt, so keystrokes go to npm and the question times out having asked
 * nothing. Two processes reading one terminal is a race a package cannot win,
 * and the cost of losing is a stall on every install. Hence a second command.
 *
 * Rules this hook holds itself to:
 *  - It NEVER fails the install. Any error is swallowed, exit code is 0.
 *  - It never overwrites; existing files are left alone.
 *  - It never blocks: nothing here waits on input.
 *  - It does nothing when there is no consuming project.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { scaffoldAuth, recordStep, stepStatus, clearNote, TEMPLATES, ENV_KEY, pkg } from './scaffold.mjs'

const project = process.env.INIT_CWD
const tag = `[${pkg.name}]`

function stop(reason) {
  if (process.env.AUTH_CLIENT_DEBUG) console.log(`${tag} skipped: ${reason}`)
  process.exit(0)
}

/**
 * npm hides postinstall output unless --foreground-scripts is passed, so the
 * remaining work is also left in the project as a file. Rewritten each install
 * so it always describes what is *currently* outstanding.
 */
function writeNote(status) {
  const pending = ['env', 'wire'].filter((step) => status[step] === 'pending')
  const note = join(project, 'src', 'auth', 'NEXT-STEPS.txt')
  if (!pending.length) { clearNote({ project }); return }

  const describe = {
    env: `  · .env         add ${ENV_KEY}                  — npx auth-client env`,
    wire: '  · app wiring   replace src/main.jsx + App.jsx  — npx auth-client wire',
  }

  writeFileSync(note, [
    `${pkg.name} v${pkg.version}`,
    '',
    'src/auth/ is in place. Still to do:',
    '',
    ...pending.map((step) => describe[step]),
    '',
    'Run this to be walked through what is left:',
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

  const { created } = scaffoldAuth({ project })
  recordStep({ project, step: 'auth', status: 'done' })

  const status = stepStatus({ project })
  const pending = ['env', 'wire'].filter((step) => status[step] === 'pending')

  console.log(`\n${tag} ${created.length ? `scaffolded ${created.length} files into src/auth/` : 'src/auth/ already present'}`)
  console.log(pending.length
    ? `${tag} next: npx auth-client setup   (${pending.join(' + ')})\n`
    : `${tag} setup complete\n`)

  writeNote(status)
  process.exit(0)
} catch (error) {
  console.log(`\n${tag} could not scaffold automatically (${error.message}).`)
  console.log(`${tag} run: npx auth-client setup\n`)
  process.exit(0)
}
