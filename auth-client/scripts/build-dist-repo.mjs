/**
 * Assembles the public, distribution-only repository.
 *
 * This repo (AuthPlatform/auth-client) is the source of truth: src/, bin/,
 * templates/, scripts/, configs and docs all live here. The published repo
 * carries only what a consumer actually needs to install and run:
 *
 *   package.json      stripped: no devDependencies, no build scripts
 *   dist/             the built library, plus dist/bin and dist/templates
 *   README.md
 *
 * There is deliberately no `prepare` script in the output: it has no src/ to
 * build from, and npm runs `prepare` for git dependencies — it would fail the
 * install.
 *
 *   node scripts/build-dist-repo.mjs [--out /home/user/auth-client]
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFlag = process.argv.indexOf('--out')
const OUT = outFlag !== -1 ? process.argv[outFlag + 1] : '/home/user/auth-client'

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))

// --- 1. the build must be present ------------------------------------------
for (const required of [
  'dist/index.js',
  'dist/style.css',
  'dist/bin/postinstall.mjs',
  'dist/bin/tty.mjs',
  'dist/templates/auth/config.js',
  'dist/templates/auth/home.css',
  'dist/templates/app/App.jsx',
  'dist/templates/env',
]) {
  if (!existsSync(join(PKG_DIR, required))) {
    console.error(`Missing ${required}. Run \`npm run build\` first.`)
    process.exit(1)
  }
}

// --- 2. wipe only what this script owns ------------------------------------
// Scoped deliberately: wiping the whole directory would delete unrelated
// files someone keeps there (.git, .gitignore, other tools' output).
// `dist/` goes wholesale so deletions inside it propagate.
mkdirSync(OUT, { recursive: true })
for (const owned of ['dist', 'package.json', 'README.md']) {
  rmSync(join(OUT, owned), { recursive: true, force: true })
}

// --- 3. copy the artifact --------------------------------------------------
cpSync(join(PKG_DIR, 'dist'), join(OUT, 'dist'), { recursive: true })
cpSync(join(PKG_DIR, 'README.md'), join(OUT, 'README.md'))

// --- 4. a package.json with only what an install needs ---------------------
const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords,
  license: pkg.license,
  type: pkg.type,
  main: pkg.main,
  module: pkg.module,
  exports: pkg.exports,
  sideEffects: pkg.sideEffects,
  engines: pkg.engines,
  // Explicit allowlist. Without it npm falls back to .gitignore and warns
  // "No .npmignore file found" on every consumer's install.
  files: ['dist', 'README.md'],
  // bin and the postinstall hook now live inside dist/.
  bin: { 'auth-client': './dist/bin/auth-client.mjs' },
  scripts: { postinstall: 'node dist/bin/postinstall.mjs' },
  dependencies: pkg.dependencies,
  peerDependencies: pkg.peerDependencies,
  peerDependenciesMeta: pkg.peerDependenciesMeta,
  repository: pkg.repository,
}
writeFileSync(join(OUT, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n')

// --- 5. report -------------------------------------------------------------
const count = (dir) =>
  readdirSync(join(dir, 'dist'), { recursive: true }).length + 2 // + package.json, README

const isRepo = existsSync(join(OUT, '.git'))
console.log(`
Distribution repo assembled at ${OUT}
  ${pkg.name}@${pkg.version}  ·  ${count(OUT)} files
  package.json (no devDependencies, no build scripts), dist/, README.md

${isRepo ? 'Existing git repo — review and commit:' : 'Not a git repo yet:'}
  cd ${OUT}${isRepo ? '' : ' && git init -b main'}
  git add -A && git status --short
  git commit -m "release ${pkg.name}@${pkg.version}"
  git push
`)

if (isRepo) {
  try {
    const changed = execFileSync('git', ['status', '--porcelain'], { cwd: OUT, encoding: 'utf8' }).trim()
    console.log(changed ? `Pending changes:\n${changed.split('\n').slice(0, 15).join('\n')}\n` : 'No changes since the last release.\n')
  } catch {
    // Not fatal — the assembly already succeeded.
  }
}
