#!/usr/bin/env node
/**
 * @7edge/auth-client CLI.
 *
 *   npx auth-client init [--dir src/auth] [--force]
 *
 * Installing the package normally scaffolds automatically (postinstall). This
 * command is the manual equivalent — for re-scaffolding after an upgrade
 * (`--force`), a non-default location (`--dir`), or when install scripts are
 * disabled in your environment.
 */

import { scaffold, nextSteps, pkg, c, ENV_KEY } from './scaffold.mjs'

// npm sets INIT_CWD to the directory the command was run from.
const PROJECT = process.env.INIT_CWD || process.cwd()

function init(args) {
  const force = args.includes('--force')
  const dirFlag = args.indexOf('--dir')
  const relDir = dirFlag !== -1 ? args[dirFlag + 1] : 'src/auth'

  console.log(`\n${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}`)
  console.log(c.dim(`scaffolding into ${PROJECT}\n`))

  const { created, skipped, dir } = scaffold({ project: PROJECT, dir: relDir, force })

  created.forEach((f) => console.log(`  ${c.green('created')}  ${f}`))
  skipped.forEach((f) => console.log(`  ${c.yellow('skipped')}  ${f}`))

  if (skipped.length && !force) {
    console.log(c.dim('\n  Existing files were left alone. Re-run with --force to overwrite.'))
  }

  console.log(nextSteps(dir))
}

function help() {
  console.log(`
${c.bold(pkg.name)} ${c.dim(`v${pkg.version}`)}

  Installing the package scaffolds ${c.bold('src/auth/')} and ${c.bold('.env')} automatically.
  Use this command to redo it manually.

  ${c.bold('npx auth-client init')}        scaffold the auth folder and .env

  Options
    --dir <path>    where to scaffold        ${c.dim('(default: src/auth)')}
    --force         overwrite existing files ${c.dim('(default: skip them)')}

  ${c.dim(`.env is never rewritten if ${ENV_KEY} is already set.`)}
`)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'init':
    init(args)
    break
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    help()
    break
  default:
    console.error(c.red(`Unknown command: ${command}`))
    help()
    process.exit(1)
}
