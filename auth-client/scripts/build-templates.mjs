/**
 * Generates the files scaffolded into a consuming project as `src/auth/`.
 *
 * Everything visual is DERIVED from src/ui/ rather than hand-maintained, so a
 * change to a library screen or primitive can never silently drift from the
 * copy a team gets.
 *
 * The generated folder is self-contained: screens, the primitives they are
 * built from, validation and the UI constants are all local files the project
 * owns and can edit. The only thing imported from the package is `useAuth` —
 * the auth engine, which is not a thing you customise by editing.
 *
 *   src/auth/
 *     index.js           barrel (static template)
 *     AuthFlow.jsx       the pre-auth journey
 *     screens/*.jsx      7 screens
 *     components/*.jsx   7 primitives — edit or replace with your own
 *     validation.js      the field rules
 *     constants.js       screen names, identifier types, OTP settings
 *     home.css           styling for the generated home page
 *
 *   node scripts/build-templates.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name
/** Hand-written templates (barrel, app wiring, .env block, home.css). */
const STATIC = join(ROOT, 'templates')
const OUT = join(ROOT, 'dist/templates')

const SCREENS = [
  'SignIn', 'SignUp', 'OtpVerify', 'ForgotPassword',
  'ResetPassword', 'ChangePassword', 'DeleteAccount',
]

const COMPONENTS = [
  'Alert', 'AuthCard', 'Button', 'FormField',
  'IdentifierInput', 'LoadingSpinner', 'PasswordField',
]

/**
 * Rewrites the library's internal import paths to the generated layout.
 *
 * `src/ui/` nests primitives as `components/<Name>/index.jsx`; the ejected copy
 * flattens them to `components/<Name>.jsx`, so sibling imports shift by a
 * level. Anything still pointing into the library becomes a named import from
 * the package.
 *
 * @param {string} source
 * @param {Record<string, string>} paths  specifier -> replacement
 * @param {string[]} fromPackage          specifiers to pull from the package
 */
function rewrite(source, paths, fromPackage) {
  const names = new Set()

  let out = source.replace(
    /^import\s+([^;]+?)\s+from\s+'([^']+)'\n/gm,
    (match, clause, specifier) => {
      if (!specifier.startsWith('.')) return match // react, etc.

      if (fromPackage.includes(specifier)) {
        // `import { useAuth } from '../../react/useAuth'` -> package import.
        // A default import of a library module is a *named* export on the barrel.
        const named = clause.match(/\{([^}]*)\}/)?.[1] ?? ''
        const defaultName = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim()
        named.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => names.add(n))
        if (defaultName) names.add(defaultName)
        return ''
      }

      const mapped = paths[specifier]
      return mapped ? match.replace(`'${specifier}'`, `'${mapped}'`) : match
    }
  )

  if (names.size) {
    const single = names.size === 1
    const packageImport = single
      ? `import { ${[...names][0]} } from '${PKG}'\n`
      : `import {\n${[...names].sort().map((n) => `  ${n},`).join('\n')}\n} from '${PKG}'\n`
    // Insert after the last surviving import so react stays on top.
    const lastImport = [...out.matchAll(/^import[^;]*?from\s+'[^']+'\n/gm)].pop()
    out = lastImport
      ? out.slice(0, lastImport.index + lastImport[0].length) + packageImport + out.slice(lastImport.index + lastImport[0].length)
      : packageImport + out
  }

  return collapseImports(out).replace(/\n{3,}/g, '\n\n')
}

/**
 * Two library modules can map onto the same local file, leaving a screen with
 * `import { AUTH_SCREENS } from '../constants'` directly above
 * `import { IDENTIFIER_TYPE } from '../constants'`. Merge them — a generated
 * file should read like one a person wrote.
 */
function collapseImports(source) {
  const seen = new Map()
  const lines = source.split('\n')
  const out = []

  for (const line of lines) {
    const match = line.match(/^import \{([^}]+)\} from '([^']+)'$/)
    if (!match) { out.push(line); continue }

    const [, clause, specifier] = match
    const names = clause.split(',').map((n) => n.trim()).filter(Boolean)

    if (seen.has(specifier)) {
      const at = seen.get(specifier)
      const merged = [...new Set([...out[at].match(/\{([^}]+)\}/)[1]
        .split(',').map((n) => n.trim()).filter(Boolean), ...names])].sort()
      out[at] = `import { ${merged.join(', ')} } from '${specifier}'`
      continue
    }
    seen.set(specifier, out.length)
    out.push(`import { ${names.join(', ')} } from '${specifier}'`)
  }
  return out.join('\n')
}

/** One line, not a seven-line essay. These files should read like the project's own. */
const banner = (name) => `// ${name} — yours to edit. Not overwritten by a package upgrade.\n`

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'auth', 'screens'), { recursive: true })
mkdirSync(join(OUT, 'auth', 'components'), { recursive: true })
// templates/auth -> src/auth, templates/app -> main.jsx + App.jsx, templates/env -> .env
cpSync(STATIC, OUT, { recursive: true })

// --- primitives: components/<Name>/index.jsx -> components/<Name>.jsx -------
const componentPaths = Object.fromEntries([
  ...COMPONENTS.map((name) => [`../${name}`, `./${name}`]),
  ['../../../core/constants', '../constants'],
])

for (const name of COMPONENTS) {
  const source = readFileSync(join(ROOT, 'src/ui/components', name, 'index.jsx'), 'utf8')
  writeFileSync(
    join(OUT, 'auth', 'components', `${name}.jsx`),
    banner(name) + rewrite(source, componentPaths, [])
  )
}

// --- screens ---------------------------------------------------------------
const screenPaths = { '../../core/constants': '../constants' }

for (const name of SCREENS) {
  const source = readFileSync(join(ROOT, 'src/ui/screens', `${name}.jsx`), 'utf8')
  writeFileSync(
    join(OUT, 'auth', 'screens', `${name}.jsx`),
    banner(name) + rewrite(source, screenPaths, ['../../react/useAuth'])
  )
}

// --- AuthFlow: ./screens/* stay relative so it drives the ejected copies ---
const authFlow = readFileSync(join(ROOT, 'src/ui/AuthFlow.jsx'), 'utf8')
writeFileSync(
  join(OUT, 'auth', 'AuthFlow.jsx'),
  banner('AuthFlow') + rewrite(authFlow, { '../core/constants': './constants' }, ['../react/useAuth'])
)

// --- validation ------------------------------------------------------------
writeFileSync(
  join(OUT, 'auth', 'validation.js'),
  banner('validation') + rewrite(
    readFileSync(join(ROOT, 'src/ui/validation.js'), 'utf8'),
    { '../core/constants': './constants' },
    []
  )
)

// --- constants: the UI-facing subset, flattened into one local file --------
// Screen names are UI-only; the identifier/OTP values are part of the request
// payloads, so they are reproduced here rather than invented.
const core = readFileSync(join(ROOT, 'src/core/constants.js'), 'utf8')
const lift = (name) => {
  const match = core.match(new RegExp(`export const ${name} = [^\\n]*(\\n(?!export)[^\\n]*)*`))
  if (!match) throw new Error(`Could not lift ${name} from src/core/constants.js`)
  return match[0].trimEnd()
}

writeFileSync(
  join(OUT, 'auth', 'constants.js'),
  [
    banner('constants').trimEnd(),
    '',
    readFileSync(join(ROOT, 'src/ui/constants.js'), 'utf8').trimEnd(),
    '',
    lift('IDENTIFIER_TYPE'),
    '',
    lift('OTP_PURPOSE'),
    '',
    lift('OTP_LENGTH'),
    '',
  ].join('\n')
)

// --- every relative import must resolve inside the generated tree ----------
const generated = readdirSync(join(OUT, 'auth'), { recursive: true }).map(String)
const broken = []

for (const file of generated.filter((f) => /\.jsx?$/.test(f))) {
  // Comments mention paths too ("import ... from './auth'"), so scan code only.
  const source = readFileSync(join(OUT, 'auth', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const [, specifier] of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    const resolved = join(dirname(join(OUT, 'auth', file)), specifier)
    const found = ['', '.js', '.jsx', '/index.js', '/index.jsx'].some((ext) => existsSync(resolved + ext))
    if (!found) broken.push(`${file} -> ${specifier}`)
  }
}

// --- the app template may only import names the barrel actually exports ----
// Paths resolving is not enough: dropping a name from the barrel while the
// home page still imports it fails in the consumer's build, not ours.
const barrel = readFileSync(join(OUT, 'auth', 'index.js'), 'utf8')
const exported = new Set([
  ...[...barrel.matchAll(/export\s+\{([^}]+)\}/g)]
    .flatMap(([, clause]) => clause.split(',').map((n) => n.trim().split(/\s+as\s+/).pop().trim()))
    .filter(Boolean),
  ...[...barrel.matchAll(/export\s+\{\s*default\s+as\s+(\w+)/g)].map(([, n]) => n),
])

const appTemplate = readFileSync(join(OUT, 'app', 'App.jsx'), 'utf8')
for (const [, clause] of appTemplate.matchAll(/import\s+\{([^}]+)\}\s+from\s+'\.\/auth'/g)) {
  for (const name of clause.split(',').map((n) => n.trim()).filter(Boolean)) {
    if (!exported.has(name)) broken.push(`app/App.jsx imports { ${name} }, which src/auth/index.js does not export`)
  }
}

if (broken.length) {
  console.error('Generated templates are inconsistent:')
  broken.forEach((b) => console.error(`  ${b}`))
  process.exit(1)
}

console.log(
  `dist/templates rebuilt: ${SCREENS.length} screens, ${COMPONENTS.length} components, ` +
  'validation, constants, AuthFlow, barrel, app wiring, env'
)
