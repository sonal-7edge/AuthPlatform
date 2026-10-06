#!/usr/bin/env node
'use strict'

/* ------------------------------------------------------------------
   Drops this package's auth service into the host project.

   Runs automatically on `npm install` (see the postinstall script) and
   can be re-run by hand at any time:

       npx auth-backend                 # copy, never clobber
       npx auth-backend --force         # overwrite what's already there
       npx auth-backend --into api      # choose the parent directory
       npx auth-backend --as identity   # choose the folder name

   Destination: <project>/service/auth when a service directory exists,
   otherwise <project>/auth.
------------------------------------------------------------------ */

const fs = require('node:fs')
const path = require('node:path')

const PKG_ROOT = path.join(__dirname, '..')

/* What lands in the host project. Everything else in the package
   (scripts/, package.json) stays behind in node_modules. */
const PAYLOAD = ['handlers', 'lib', 'utils', 'docs', 'template.yaml', '.env.example', 'README.md']

/* templates/ holds what the scaffolded folder needs to stand on its own: its
   own package.json (deploy scripts), samconfig.toml and scripts/deploy.sh.
   Its contents are flattened onto the target, so templates/package.json lands
   as <target>/package.json. This package's own package.json is deliberately
   NOT copied — it carries the postinstall hook and would recurse. */
const TEMPLATE_DIR = 'templates'

/* Checked in order; the first one that exists becomes the parent. */
const SERVICE_DIRS = ['service', 'services', 'src/service', 'src/services']

/* Never copied, even if a published tarball somehow carries them. */
const SKIP = new Set(['node_modules', 'coverage', '.aws-sam', 'build', '__tests__', '.env'])

/* -------------------------- arg parsing -------------------------- */

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name) => {
    const i = argv.indexOf(name)
    return i === -1 || i === argv.length - 1 ? null : argv[i + 1]
}

const POSTINSTALL = flag('--postinstall')
const FORCE = flag('--force') || process.env.AUTH_BACKEND_FORCE === '1'

/* ---------------------------- output ----------------------------- */

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (colour ? `\u001b[${code}m${s}\u001b[0m` : s)
const bold = (s) => paint('1', s)
const dim = (s) => paint('2', s)
const green = (s) => paint('32', s)
const yellow = (s) => paint('33', s)

/* ---------------------------- helpers ---------------------------- */

const isDir = (p) => {
    try {
        return fs.statSync(p).isDirectory()
    } catch {
        return false
    }
}

/* True when we're sitting in someone else's node_modules rather than
   in a checkout of this repo. */
const installedAsDependency = () => PKG_ROOT.split(path.sep).includes('node_modules')

function projectRoot() {
    /* npm, yarn and pnpm all set INIT_CWD to the directory the install
       was started from. */
    const initCwd = process.env.INIT_CWD
    if (initCwd && path.resolve(initCwd) !== PKG_ROOT) return path.resolve(initCwd)

    /* Otherwise, the project that owns the node_modules we live in. */
    const marker = `${path.sep}node_modules${path.sep}`
    const i = PKG_ROOT.lastIndexOf(marker)
    if (i !== -1) return PKG_ROOT.slice(0, i)

    return process.cwd()
}

function destination(root) {
    const name = option('--as') || 'auth'

    const into = option('--into')
    if (into) return path.join(path.resolve(root, into), name)

    for (const candidate of SERVICE_DIRS) {
        const parent = path.join(root, candidate)
        if (isDir(parent)) return path.join(parent, name)
    }
    return path.join(root, name)
}

function copyDir(src, dest, report) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue
        const from = path.join(src, entry.name)
        const to = path.join(dest, entry.name)
        if (entry.isDirectory()) copyDir(from, to, report)
        else copyFile(from, to, report)
    }
}

function copyFile(from, to, report) {
    if (fs.existsSync(to) && !FORCE) {
        report.kept.push(to)
        return
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    report.written.push(to)
}

/* ----------------------------- main ------------------------------ */

function main() {
    const root = projectRoot()

    /* `npm install` run inside this package's own checkout — there is no
       host project to scaffold into. */
    if (POSTINSTALL && (!installedAsDependency() || path.resolve(root) === PKG_ROOT)) return

    const target = destination(root)
    const report = { written: [], kept: [] }

    for (const item of PAYLOAD) {
        const from = path.join(PKG_ROOT, item)
        if (!fs.existsSync(from)) continue
        const to = path.join(target, item)
        if (isDir(from)) copyDir(from, to, report)
        else copyFile(from, to, report)
    }

    /* Flattened onto the target root, not nested under templates/. */
    const templates = path.join(PKG_ROOT, TEMPLATE_DIR)
    if (isDir(templates)) copyDir(templates, target, report)

    /* npm strips the executable bit from published files and `npm run
       deploy:env` shells out to this, so put it back. */
    const deploy = path.join(target, 'scripts', 'deploy.sh')
    if (fs.existsSync(deploy)) {
        try {
            fs.chmodSync(deploy, 0o755)
        } catch {
            /* a read-only checkout is not worth failing an install over */
        }
    }

    const where = path.relative(root, target) || target
    if (report.written.length === 0) {
        console.log(`${dim('auth-backend')} ${where} is already in place — nothing copied.`)
    } else {
        console.log(`${green('auth-backend')} ${bold(where)} — ${report.written.length} file(s) written.`)
    }
    if (report.kept.length > 0 && !FORCE) {
        console.log(
            `${yellow('auth-backend')} kept ${report.kept.length} existing file(s). ` +
                `Re-run with ${bold('--force')} to overwrite them.`,
        )
    }
    if (report.written.length > 0) {
        console.log(dim(`             next: cd ${where} && cp .env.example .env`))
        console.log(dim(`                   then edit .env and run: npm run deploy:env`))
    }
}

try {
    main()
} catch (err) {
    /* A scaffolding failure must never break someone's `npm install`. */
    if (POSTINSTALL) {
        console.warn(`${yellow('auth-backend')} could not scaffold the auth folder: ${err.message}`)
        console.warn(`${dim('             run `npx auth-backend` to retry.')}`)
    } else {
        console.error(`auth-backend: ${err.message}`)
        process.exitCode = 1
    }
}
