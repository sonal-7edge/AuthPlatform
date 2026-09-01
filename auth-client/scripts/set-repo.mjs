/**
 * Points the package and its docs at a GitHub repository.
 *
 *   npm run set-repo -- <owner>/<repo>
 *   npm run set-repo -- myuser/auth-client
 *
 * Rewrites every install command and the package.json repository URL, so
 * moving the project to a different account is one command rather than a
 * find-and-replace across four files.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]

if (!target || !/^[\w.-]+\/[\w.-]+$/.test(target)) {
  console.error('Usage: npm run set-repo -- <owner>/<repo>   e.g. myuser/auth-client')
  process.exit(1)
}

const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

// Whatever it currently points at, derived from package.json so the two can
// never disagree about what is being replaced.
const current = pkg.repository?.url?.match(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1]
if (!current) {
  console.error('Could not read the current owner/repo from package.json')
  process.exit(1)
}

if (current === target) {
  console.log(`Already set to ${target} — nothing to do.`)
  process.exit(0)
}

pkg.repository = { type: 'git', url: `git+https://github.com/${target}.git` }
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`  package.json  ${current} -> ${target}`)

for (const file of ['README.md']) {
  const path = join(ROOT, file)
  const before = readFileSync(path, 'utf8')
  const after = before.replaceAll(current, target)
  const hits = before.split(current).length - 1

  if (hits) writeFileSync(path, after)
  console.log(`  ${file.padEnd(13)} ${hits} occurrence${hits === 1 ? '' : 's'} updated`)
}

console.log(`\nInstall command is now:  npm install github:${target}\n`)
