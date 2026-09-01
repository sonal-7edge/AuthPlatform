#!/usr/bin/env node
/**
 * Runs automatically after `npm install @7edge/auth-client`, scaffolding
 * src/auth/ and .env into the installing project so no second command is needed.
 *
 * Rules this hook holds itself to:
 *  - It NEVER fails the install. Any error is reported and swallowed; a
 *    scaffolding problem must not break `npm install` for the whole project.
 *  - It never overwrites. Existing files are skipped, and an existing
 *    VITE_API_BASE_URL is left untouched — so reinstalling is safe.
 *  - It does nothing when there is no consuming project (developing this
 *    package itself, or a transitive/CI install with no INIT_CWD).
 *
 * npm may block install scripts entirely (`--ignore-scripts`, or npm's
 * allow-scripts prompt). In that case nothing here runs at all, and
 * `npx auth-client init` is the manual equivalent — see the README.
 */

import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { scaffold, nextSteps, PKG_ROOT, TEMPLATES, pkg, c } from './scaffold.mjs'

/** The directory the user ran `npm install` in, per npm. */
const project = process.env.INIT_CWD

function skip(reason) {
  // Silent by design: these are the normal no-op cases, not problems.
  if (process.env.AUTH_CLIENT_DEBUG) console.log(`[auth-client] skipped: ${reason}`)
  process.exit(0)
}

try {
  if (!project) skip('no INIT_CWD (not a user-initiated install)')

  // Installing this package's own devDependencies while developing it.
  if (resolve(project) === resolve(PKG_ROOT)) skip('installing our own dependencies')

  // A transitive install: the "project" is itself inside node_modules.
  if (project.split(sep).includes('node_modules')) skip('transitive install')

  // No package.json means there is no project to scaffold into.
  if (!existsSync(join(project, 'package.json'))) skip('no package.json in INIT_CWD')

  // For a git install, `prepare` builds dist before this runs. If it somehow
  // has not, there is nothing to copy — defer to the manual command.
  if (!existsSync(TEMPLATES)) {
    console.log(`\n[${pkg.name}] build output not found yet — run ${c.bold('npx auth-client init')} to scaffold.\n`)
    process.exit(0)
  }

  const { created, skipped, dir } = scaffold({ project })

  // Nothing to say if a previous install already did the work.
  if (!created.length) skip('already scaffolded')

  console.log(`\n${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}`)
  created.forEach((f) => console.log(`  ${c.green('created')}  ${f}`))
  skipped.forEach((f) => console.log(`  ${c.yellow('skipped')}  ${f}`))
  console.log(nextSteps(dir))
} catch (error) {
  // Never break the install.
  console.log(
    `\n[${pkg.name}] could not scaffold automatically (${error.message}).` +
    `\n  Run ${c.bold('npx auth-client init')} to do it manually.\n`
  )
  process.exit(0)
}
