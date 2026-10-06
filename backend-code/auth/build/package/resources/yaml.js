/* Minimal YAML serializer for plain JSON values (objects, arrays, strings,
   numbers, booleans, null). Sufficient for the CloudFormation template
   objects produced by resources/template.js.

   Intrinsic functions are emitted in their long form ({ "Ref": ... },
   { "Fn::Sub": ... }) rather than the !Ref / !Sub shorthand, so no custom
   tag handling is needed here. */

function needsQuote(s) {
    if (s === '') return true
    if (/^\s|\s$/.test(s)) return true
    if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true
    if (/^[-+]?[0-9.]+$/.test(s)) return true
    // Date-like scalars (e.g. the 2010-09-09 template version) would otherwise
    // be read back as timestamps rather than strings.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true
    if (/[:#{}[\],&*!|>'"%@`]/.test(s)) return true
    if (/^[?-]/.test(s)) return true
    return false
}

function scalar(v) {
    if (v === null) return 'null'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return String(v)
    const s = String(v)
    return needsQuote(s) ? JSON.stringify(s) : s
}

const isPrimitive = (v) => v === null || typeof v !== 'object'
// Guard on typeof object: Object.keys(1) is also empty, and treating numbers
// as empty maps turns every number in an array into "{}".
const isEmpty = (v) => (Array.isArray(v) && v.length === 0)
    || (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

function dump(value, indent) {
    const pad = '  '.repeat(indent)

    if (Array.isArray(value)) {
        if (value.length === 0) return `${pad}[]`
        return value
            .map((item) => {
                if (isPrimitive(item) || isEmpty(item)) {
                    const empty = Array.isArray(item) ? '[]' : '{}'
                    return `${pad}- ${isEmpty(item) ? empty : scalar(item)}`
                }
                const lines = dump(item, indent + 1).split('\n')
                lines[0] = `${pad}- ${lines[0].slice((indent + 1) * 2)}`
                return lines.join('\n')
            })
            .join('\n')
    }

    return Object.keys(value)
        .map((k) => {
            const v = value[k]
            if (isPrimitive(v)) return `${pad}${k}: ${scalar(v)}`
            if (isEmpty(v)) return `${pad}${k}: ${Array.isArray(v) ? '[]' : '{}'}`
            return `${pad}${k}:\n${dump(v, indent + 1)}`
        })
        .join('\n')
}

function toYaml(obj) {
    return `${dump(obj, 0)}\n`
}

module.exports = { toYaml }
