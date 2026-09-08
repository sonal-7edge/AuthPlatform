/**
 * The scaffolding routine shared by the postinstall hook and `auth-client init`.
 *
 * Copies the generated templates into a consuming project and merges the auth
 * block into its .env. Never overwrites: existing files are reported as skipped
 * unless `force` is set, and an existing VITE_API_BASE_URL is always left alone.
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync, appendFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * These files run from two layouts:
 *   source tree      bin/scaffold.mjs        -> templates at ../dist/templates
 *   published repo   dist/bin/scaffold.mjs   -> templates at ../templates
 * Resolve by looking for the templates rather than assuming a depth.
 */
export const TEMPLATES = [
  join(HERE, '../dist/templates'),
  join(HERE, '../templates'),
].find((candidate) => existsSync(join(candidate, 'config.js'))) ?? join(HERE, '../templates')

/** Walk up until a package.json turns up — works from either layout. */
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
    // `env` is not part of the folder — it is merged into .env separately.
    if (entry === 'env') continue

    if (existsSync(target) && !force) {
      skipped.push(relative(project, target))
      continue
    }
    writeFileSync(target, readFileSync(source))
    created.push(relative(project, target))
  }
}

/** Creates .env, or appends our block. Never rewrites a value already set. */
function writeEnv(project, created, skipped) {
  const envPath = join(project, '.env')
  const block = readFileSync(join(TEMPLATES, 'env'), 'utf8')

  if (!existsSync(envPath)) {
    writeFileSync(envPath, block.trimStart())
    created.push('.env')
    return
  }

  const current = readFileSync(envPath, 'utf8')
  if (current.includes(ENV_KEY)) {
    skipped.push(`.env ${c.dim(`(${ENV_KEY} already set)`)}`)
    return
  }

  appendFileSync(envPath, (current.endsWith('\n') ? '' : '\n') + block)
  created.push(`.env ${c.dim('(appended)')}`)
}

/**
 * @param {{ project: string, dir?: string, force?: boolean }} options
 * @returns {{ created: string[], skipped: string[], dir: string }}
 */
export function scaffold({ project, dir = 'src/auth', force = false }) {
  const created = []
  const skipped = []

  copyTree(TEMPLATES, resolve(project, dir), project, force, created, skipped)
  writeEnv(project, created, skipped)

  return { created, skipped, dir }
}

export function nextSteps(dir) {
  return `
${c.bold('Next steps')}

  1. Import the stylesheet once, at your app root:
       ${c.dim(`import '${pkg.name}/style.css'`)}

  2. Wrap your app:
       ${c.dim(`import { AuthProvider, useAuth, AuthFlow, authConfig } from './${dir.replace(/^src\//, '')}'`)}

       ${c.dim('<AuthProvider config={authConfig}>')}
       ${c.dim('  {isAuthenticated ? <App /> : <AuthFlow />}')}
       ${c.dim('</AuthProvider>')}

  3. Point ${c.bold(ENV_KEY)} in .env at your authentication API. It is
     required — there is no offline fallback, and Vite only reads .env at
     startup, so restart the dev server after changing it.

  The screens in ${c.bold(dir)} are yours — edit them directly.
`
}
