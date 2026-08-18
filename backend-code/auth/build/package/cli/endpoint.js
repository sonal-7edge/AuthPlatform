#!/usr/bin/env node

/* ------------------------------------------------------------------
   Endpoint CLI — the only thing you should edit routes with.

   config/endpoints.json is the source of truth; this tool adds/removes
   entries in it, scaffolds the matching handler, and regenerates
   resources/auth_cloudformation.yml so the template and the registry can
   never drift apart.

     node cli/endpoint.js add --path /auth/mfa/setup --authorizer cognito \
         --header X-Client-Id:required --header X-Device-Id
     node cli/endpoint.js list
     node cli/endpoint.js show change-password
     node cli/endpoint.js remove mfa-setup
     node cli/endpoint.js generate

   Run with --help for the full flag list.
------------------------------------------------------------------ */

const fs = require('node:fs')
const path = require('node:path')

const {
    CONFIG_PATH,
    TEMPLATE_PATH,
    AUTHORIZERS,
    HTTP_METHODS,
    loadConfig,
    resolveEndpoints,
    buildTemplateObject,
    templateAsYaml,
    writeTemplate,
} = require('../resources/template')

const ROOT = path.join(__dirname, '..')

/* ---------------------------- output ----------------------------- */

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (colour ? `[${code}m${s}[0m` : s)
const bold = (s) => paint('1', s)
const dim = (s) => paint('2', s)
const green = (s) => paint('32', s)
const yellow = (s) => paint('33', s)
const red = (s) => paint('31', s)

const rel = (p) => path.relative(process.cwd(), p) || p

function die(message) {
    console.error(`${red('error')}  ${message}`)
    process.exit(1)
}

/* -------------------------- arg parsing -------------------------- */

/* Supports --flag, --no-flag, --key value, --key=value and repeated keys
   (which collect into an array). Bare words become positionals. */
function parseArgs(argv) {
    const flags = {}
    const positionals = []

    const set = (key, value) => {
        if (key in flags) {
            flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value]
        } else {
            flags[key] = value
        }
    }

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (!arg.startsWith('--')) {
            positionals.push(arg)
            continue
        }
        const body = arg.slice(2)
        const eq = body.indexOf('=')
        if (eq !== -1) {
            set(body.slice(0, eq), body.slice(eq + 1))
            continue
        }
        if (body.startsWith('no-')) {
            set(body.slice(3), false)
            continue
        }
        const next = argv[i + 1]
        if (next === undefined || next.startsWith('--')) {
            set(body, true)
        } else {
            set(body, next)
            i += 1
        }
    }

    return { flags, positionals }
}

const asArray = (v) => (v === undefined ? [] : [].concat(v))

/* '--header X-Client-Id:required' / '--header X-Client-Id' */
function parseHeader(spec) {
    const [rawName, rawMode = 'optional'] = String(spec).split(':')
    const name = rawName.trim()
    if (!name) die(`Could not read a header name out of "${spec}".`)
    if (!/^[A-Za-z0-9-]+$/.test(name)) {
        die(`Header "${name}" may only contain letters, digits and hyphens.`)
    }
    const mode = rawMode.trim().toLowerCase()
    if (!['required', 'optional'].includes(mode)) {
        die(`Header "${name}" has qualifier "${mode}"; expected "required" or "optional".`)
    }
    return { name, required: mode === 'required' }
}

/* ------------------------ config read/write ---------------------- */

function readConfig() {
    try {
        return loadConfig()
    } catch (err) {
        return die(`Could not read ${rel(CONFIG_PATH)} — ${err.message}`)
    }
}

function saveConfig(config) {
    // Validate before persisting so a bad flag never corrupts the registry.
    try {
        resolveEndpoints(config)
    } catch (err) {
        return die(err.message)
    }
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    return config
}

function regenerate(config) {
    try {
        writeTemplate(config)
    } catch (err) {
        return die(`Template generation failed — ${err.message}`)
    }
    console.log(`${green('generated')}  ${rel(TEMPLATE_PATH)}`)
    return TEMPLATE_PATH
}

/* -------------------------- scaffolding -------------------------- */

function handlerFileFor(endpoint) {
    // 'handlers/verify-otp.handler' -> '<auth>/handlers/verify-otp.js'
    const [modulePath] = endpoint.handler.split('.')
    return path.join(ROOT, `${modulePath}.js`)
}

function scaffoldHandler(endpoint) {
    const file = handlerFileFor(endpoint)
    if (fs.existsSync(file)) {
        console.log(`${dim('exists')}     ${rel(file)}`)
        return file
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })

    const authNote = endpoint.authorizer === 'none'
        ? 'Public route — no authorizer in front of it.'
        : `Protected by the ${endpoint.authorizer} authorizer; the caller identity is on `
          + 'event.requestContext.authorizer.'

    const body = `/* ${endpoint.method} ${endpoint.path}
   ${endpoint.description}

   ${authNote} */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement ${endpoint.name}
        void payload

        return json(501, { message: '${endpoint.name} is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('${endpoint.name} failed', error)
        return serverError()
    }
}
`
    fs.writeFileSync(file, body, 'utf8')
    console.log(`${green('scaffolded')} ${rel(file)}`)
    return file
}

/* --------------------------- commands ---------------------------- */

function cmdAdd(flags) {
    const config = readConfig()

    const routePath = flags.path
    if (typeof routePath !== 'string') die('--path is required, e.g. --path /auth/mfa/setup')

    const segments = routePath.split('/').filter(Boolean)
    if (segments.length === 0) die(`--path "${routePath}" has no segments.`)

    const name = typeof flags.name === 'string' ? flags.name : segments[segments.length - 1]
    const method = String(flags.method || config.defaults?.method || 'POST').toUpperCase()
    if (!HTTP_METHODS.includes(method)) {
        die(`--method ${method} is not supported (${HTTP_METHODS.join(', ')}).`)
    }

    const authorizer = String(flags.authorizer || config.defaults?.authorizer || 'none').toLowerCase()
    if (!AUTHORIZERS.includes(authorizer)) {
        die(`--authorizer ${authorizer} is not supported (${AUTHORIZERS.join(', ')}).`)
    }

    if (config.endpoints.some((e) => e.name === name)) {
        die(`An endpoint named "${name}" already exists. Remove it first or pass --name.`)
    }

    const headers = asArray(flags.header).map(parseHeader)
    const scopes = asArray(flags.scope).map(String)
    if (scopes.length && authorizer !== 'cognito') {
        die('--scope only applies to --authorizer cognito.')
    }

    const entry = {
        name,
        path: `/${segments.join('/')}`,
        method,
        authorizer,
        description: typeof flags.description === 'string'
            ? flags.description
            : `${method} /${segments.join('/')}`,
    }
    if (headers.length) entry.headers = headers
    if (scopes.length) entry.scopes = scopes
    if (flags.memory) entry.memorySize = Number(flags.memory)
    if (flags.timeout) entry.timeout = Number(flags.timeout)
    if (flags.handler) entry.handler = String(flags.handler)
    if (flags.cors === false) entry.cors = false
    if (flags['api-key'] === true) entry.apiKeyRequired = true

    if (entry.memorySize && !Number.isInteger(entry.memorySize)) die('--memory must be a whole number of MB.')
    if (entry.timeout && !Number.isInteger(entry.timeout)) die('--timeout must be a whole number of seconds.')

    const draft = { ...config, endpoints: [...config.endpoints, entry] }
    let resolved
    try {
        resolved = resolveEndpoints(draft).find((e) => e.name === name)
    } catch (err) {
        return die(err.message)
    }

    if (flags['dry-run']) {
        console.log(bold('\nWould add to config/endpoints.json:\n'))
        console.log(JSON.stringify(entry, null, 2))
        console.log(bold('\nResolved route:\n'))
        printEndpoint(resolved)
        return undefined
    }

    saveConfig(draft)
    console.log(`${green('added')}      ${method} ${resolved.path} ${dim(`(${authorizer})`)}`)
    scaffoldHandler(resolved)
    regenerate(draft)
    return undefined
}

function cmdRemove(flags, positionals) {
    const config = readConfig()
    const name = positionals[0] || flags.name
    if (typeof name !== 'string') die('Which endpoint? e.g. node cli/endpoint.js remove mfa-setup')

    const target = config.endpoints.find((e) => e.name === name)
    if (!target) die(`No endpoint named "${name}". Run "list" to see what is registered.`)

    const draft = { ...config, endpoints: config.endpoints.filter((e) => e.name !== name) }
    if (draft.endpoints.length === 0) {
        die('Refusing to remove the last endpoint — the template needs at least one route.')
    }

    if (flags['dry-run']) {
        console.log(`${yellow('would remove')} ${name} ${dim(target.path)}`)
        return
    }

    saveConfig(draft)
    console.log(`${green('removed')}    ${name} ${dim(target.path)}`)

    const handlerFile = handlerFileFor(resolveEndpointStub(target))
    if (fs.existsSync(handlerFile)) {
        console.log(`${yellow('note')}       ${rel(handlerFile)} was left in place; delete it if unused.`)
    }
    regenerate(draft)
}

// Enough of a resolved endpoint to locate the handler file for a raw entry.
function resolveEndpointStub(entry) {
    return { handler: entry.handler || `handlers/${entry.name}.handler` }
}

function printEndpoint(ep) {
    const headers = ep.headers.length
        ? ep.headers.map((h) => `${h.name}${h.required ? dim(' (required)') : ''}`).join(', ')
        : dim('none')
    console.log(`  ${bold(`${ep.method} ${ep.path}`)}`)
    console.log(`    name        ${ep.name}`)
    console.log(`    authorizer  ${ep.authorizer}${ep.scopes.length ? ` [${ep.scopes.join(' ')}]` : ''}`)
    console.log(`    handler     ${ep.handler}`)
    console.log(`    headers     ${headers}`)
    console.log(`    lambda      ${ep.memorySize} MB · ${ep.timeout}s · cors ${ep.cors ? 'on' : 'off'}`)
    console.log(`    logs        /aws/lambda/<project>-<env>-${ep.name}`)
}

function cmdList() {
    const config = readConfig()
    let endpoints
    try {
        endpoints = resolveEndpoints(config)
    } catch (err) {
        return die(err.message)
    }

    const widths = {
        method: Math.max(6, ...endpoints.map((e) => e.method.length)),
        path: Math.max(4, ...endpoints.map((e) => e.path.length)),
        auth: Math.max(10, ...endpoints.map((e) => e.authorizer.length)),
    }
    const pad = (s, w) => String(s).padEnd(w)

    console.log('')
    console.log(`  ${bold(pad('METHOD', widths.method))}  ${bold(pad('PATH', widths.path))}  `
        + `${bold(pad('AUTHORIZER', widths.auth))}  ${bold('HEADERS')}`)
    for (const ep of endpoints) {
        const headers = ep.headers.map((h) => (h.required ? `${h.name}*` : h.name)).join(', ')
        console.log(`  ${pad(ep.method, widths.method)}  ${pad(ep.path, widths.path)}  `
            + `${pad(ep.authorizer, widths.auth)}  ${dim(headers)}`)
    }
    console.log(`\n  ${endpoints.length} endpoint(s)  ${dim('* = required header')}\n`)
    return undefined
}

function cmdShow(positionals) {
    const config = readConfig()
    const name = positionals[0]
    if (!name) die('Which endpoint? e.g. node cli/endpoint.js show change-password')

    let endpoints
    try {
        endpoints = resolveEndpoints(config)
    } catch (err) {
        return die(err.message)
    }

    const ep = endpoints.find((e) => e.name === name)
    if (!ep) die(`No endpoint named "${name}".`)

    console.log('')
    printEndpoint(ep)

    const template = buildTemplateObject(config)
    const owned = Object.keys(template.Resources).filter((k) => k.startsWith(ep.logical))
    console.log(`\n  ${bold('CloudFormation resources')}`)
    for (const key of owned) console.log(`    ${key}  ${dim(template.Resources[key].Type)}`)
    console.log('')
    return undefined
}

/* Creates any handler file the registry expects but the repo does not have. */
function cmdScaffold() {
    const config = readConfig()
    let endpoints
    try {
        endpoints = resolveEndpoints(config)
    } catch (err) {
        return die(err.message)
    }
    for (const ep of endpoints) scaffoldHandler(ep)
    return undefined
}

function cmdGenerate(flags) {
    const config = readConfig()
    if (flags.stdout) {
        try {
            process.stdout.write(templateAsYaml(config))
        } catch (err) {
            die(err.message)
        }
        return
    }
    regenerate(config)
}

/* Fails if the checked-in template is stale — useful in CI. */
function cmdCheck() {
    const config = readConfig()
    let expected
    try {
        expected = templateAsYaml(config)
    } catch (err) {
        return die(err.message)
    }
    const current = fs.existsSync(TEMPLATE_PATH) ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : ''
    // The banner is prepended at write time and is not part of templateAsYaml.
    if (!current.endsWith(expected)) {
        return die(`${rel(TEMPLATE_PATH)} is out of date. Run: node cli/endpoint.js generate`)
    }
    console.log(`${green('ok')}         ${rel(TEMPLATE_PATH)} matches config/endpoints.json`)
    return undefined
}

function usage() {
    console.log(`
${bold('endpoint')} — manage AuthPlatform auth routes and their CloudFormation

${bold('USAGE')}
  node cli/endpoint.js <command> [options]

${bold('COMMANDS')}
  add                Register a route, scaffold its handler, regenerate the template
  remove <name>      Drop a route and regenerate the template
  list               Show every registered route
  show <name>        Show one route and the CFN resources it produces
  scaffold           Create any handler file the registry expects but is missing
  generate           Rewrite resources/auth_cloudformation.yml from the registry
  check              Exit non-zero if the template is stale (for CI)

${bold('ADD OPTIONS')}
  --path <path>            Route path, e.g. /auth/mfa/setup            ${dim('(required)')}
  --method <verb>          ${HTTP_METHODS.join(' | ')}   ${dim('(default POST)')}
  --authorizer <kind>      ${AUTHORIZERS.join(' | ')}          ${dim('(default none)')}
  --header <name[:mode]>   Request header; mode is required|optional   ${dim('(repeatable)')}
  --scope <scope>          OAuth scope, cognito authorizer only        ${dim('(repeatable)')}
  --name <name>            Endpoint/function name                      ${dim('(default: last path segment)')}
  --handler <ref>          Handler reference                           ${dim('(default handlers/<name>.handler)')}
  --description <text>     Shown in the template and the handler stub
  --memory <mb>            Lambda memory                               ${dim('(default 256)')}
  --timeout <seconds>      Lambda timeout                              ${dim('(default 15)')}
  --no-cors                Skip the OPTIONS preflight for this route
  --api-key                Require an API key on this route
  --dry-run                Print what would change and exit

${bold('EXAMPLES')}
  node cli/endpoint.js add --path /auth/mfa/setup --authorizer cognito \\
      --header X-Client-Id:required --header X-Device-Id --memory 512

  node cli/endpoint.js add --path /auth/webhook --method POST --authorizer lambda \\
      --header X-Signature:required --no-cors

  node cli/endpoint.js generate --stdout | head -40
`)
}

/* ----------------------------- main ------------------------------ */

function main() {
    const [, , command, ...rest] = process.argv
    const { flags, positionals } = parseArgs(rest)

    if (!command || command === 'help' || flags.help) return usage()

    switch (command) {
        case 'add': return cmdAdd(flags)
        case 'remove':
        case 'rm': return cmdRemove(flags, positionals)
        case 'list':
        case 'ls': return cmdList()
        case 'show': return cmdShow(positionals)
        case 'scaffold': return cmdScaffold()
        case 'generate':
        case 'gen': return cmdGenerate(flags)
        case 'check': return cmdCheck()
        default:
            usage()
            return die(`Unknown command "${command}".`)
    }
}

main()
