#!/usr/bin/env node
/**
 * Runs after `npm install @7edge/auth-client`.
 *
 * Step 1 (scaffold `src/auth/`) is mandatory and purely additive, so it just
 * happens. Steps 2 and 3 touch files the project owns, so they are asked for —
 * over /dev/tty, because npm's own stdio is piped (see bin/tty.mjs).
 *
 * The run is resumable. Each answer is recorded the moment it is given, so an
 * interrupted setup picks up at the step it stopped on rather than starting
 * over or re-asking what was already settled. Re-running `npm install` is the
 * supported way to continue.
 *
 * Rules this hook holds itself to:
 *  - It NEVER fails the install. Any error is swallowed, exit code is 0.
 *  - It never overwrites without saving a .bak first.
 *  - It never blocks forever: an unanswered prompt times out and changes nothing.
 *  - It does nothing when there is no consuming project.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import {
  scaffoldAuth, writeEnv, wireApp, recordStep, stepStatus,
  TEMPLATES, ENV_KEY, pkg,
} from './scaffold.mjs'
import { openTTY, promptingDisabled } from './tty.mjs'

const project = process.env.INIT_CWD
const tag = `[${pkg.name}]`

function stop(reason) {
  if (process.env.AUTH_CLIENT_DEBUG) console.log(`${tag} skipped: ${reason}`)
  process.exit(0)
}

/**
 * npm hides postinstall output, and there may be no terminal to write to, so
 * the state of play is also left in the project as a file. Rewritten (not
 * appended) on every install so it always describes the *current* remaining
 * work rather than accumulating stale copies.
 */
function writeNote(status) {
  const pending = ['env', 'wire'].filter((step) => status[step] === 'pending')
  if (!pending.length) return

  const describe = {
    env: `  · .env         add ${ENV_KEY}                     — npx auth-client env`,
    wire: '  · app wiring   replace src/main.jsx + App.jsx     — npx auth-client wire',
  }

  writeFileSync(join(project, 'src', 'auth', 'NEXT-STEPS.txt'), [
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

  // ── step 1 · always, no question ─────────────────────────────────────────
  const { created } = scaffoldAuth({ project })
  recordStep({ project, step: 'auth', status: 'done' })

  const before = stepStatus({ project })
  const remaining = ['env', 'wire'].filter((step) => before[step] === 'pending')

  console.log(`\n${tag} ${created.length ? `scaffolded ${created.length} files into src/auth/` : 'src/auth/ already present'}`)

  if (!remaining.length) {
    const why = before.env === 'done' && before.wire === 'done' ? 'setup complete' : 'nothing left to ask'
    console.log(`${tag} ${why}\n`)
    writeNote(before)
    process.exit(0)
  }

  // ── steps 2 and 3 · only with an answer ──────────────────────────────────
  const tty = openTTY()
  if (!tty) {
    const why = promptingDisabled() ?? 'no terminal attached'
    console.log(`${tag} ${why} — not prompting. Run: npx auth-client setup\n`)
    writeNote(before)
    process.exit(0)
  }

  const resuming = created.length === 0 && remaining.length < 2
  tty.write(`\n  ${pkg.name} v${pkg.version}\n`)
  tty.write(
    resuming
      ? `  Picking up where setup left off — ${remaining.length} step${remaining.length > 1 ? 's' : ''} remaining.\n\n`
      : `  src/auth/ is in place. ${remaining.length} optional step${remaining.length > 1 ? 's' : ''} left.\n\n`
  )

  if (remaining.includes('env')) {
    tty.write(`  ${ENV_KEY} tells the library which API to call.\n`)
    const yes = await tty.ask(existsSync(join(project, '.env')) ? 'Append the auth block to your .env?' : 'Create .env?', { def: true })

    if (yes === null) {
      // Unanswered — leave it pending so the next install asks again.
      tty.write('  left for later — run `npx auth-client setup` when ready.\n')
      tty.close()
      writeNote(stepStatus({ project }))
      process.exit(0)
    }
    if (yes) {
      const result = writeEnv({ project })
      recordStep({ project, step: 'env', status: 'done' })
      tty.write(`  ✓ ${result.action} .env — now set ${ENV_KEY} to your API URL (it ships as a placeholder)\n\n`)
    } else {
      recordStep({ project, step: 'env', status: 'declined' })
      tty.write(`  · skipped. To do it by hand, add ${ENV_KEY}=<your api url> to .env\n\n`)
    }
  }

  if (remaining.includes('wire')) {
    tty.write('  This REPLACES src/main.jsx and src/App.jsx (originals saved as .bak).\n')
    const yes = await tty.ask('Wire them up now?', { def: false })

    if (yes === null) {
      tty.write('  left for later — run `npx auth-client setup` when ready.\n')
      tty.close()
      writeNote(stepStatus({ project }))
      process.exit(0)
    }
    if (yes) {
      const { backedUp } = wireApp({ project })
      recordStep({ project, step: 'wire', status: 'done' })
      tty.write(`  ✓ wired src/main.jsx and src/App.jsx${backedUp.length ? ` (backed up ${backedUp.join(', ')})` : ''}\n`)
      tty.write('    undo with: npx auth-client undo\n\n')
    } else {
      recordStep({ project, step: 'wire', status: 'declined' })
      tty.write('  · skipped. Wire it yourself, or run `npx auth-client wire` later.\n\n')
    }
  }

  const after = stepStatus({ project })
  tty.write(`  Done. Set ${ENV_KEY} in .env, then npm run dev.\n\n`)
  tty.close()
  writeNote(after)
  process.exit(0)
} catch (error) {
  console.log(`\n${tag} could not finish automatically (${error.message}).`)
  console.log(`${tag} run: npx auth-client setup\n`)
  process.exit(0)
}
