/* Shared response helpers for the auth Lambda handlers.

   API Gateway answers the CORS preflight itself (MOCK integration on
   OPTIONS), but the actual response still comes from Lambda — so every
   real response has to carry the CORS headers too. */

const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || '*'

function baseHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Cache-Control': 'no-store',
    }
}

/* API Gateway proxy response. */
function json(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: { ...baseHeaders(), ...headers },
        body: JSON.stringify(body ?? {}),
    }
}

const ok = (data) => json(200, data)
const created = (data) => json(201, data)
const badRequest = (message, details) => json(400, { message, details })
const unauthorized = (message = 'Unauthorized') => json(401, { message })
const forbidden = (message = 'Forbidden') => json(403, { message })
const notFound = (message = 'Not found') => json(404, { message })
const conflict = (message) => json(409, { message })
const serverError = (message = 'Something went wrong. Please try again.') => json(500, { message })

/* Cognito's SDK errors carry a `name` that maps cleanly onto HTTP status
   codes; anything unmapped is treated as a 500 by the caller. */
const COGNITO_ERROR_STATUS = {
    UsernameExistsException: 409,
    InvalidPasswordException: 400,
    InvalidParameterException: 400,
    CodeMismatchException: 400,
    ExpiredCodeException: 400,
    NotAuthorizedException: 401,
    UserNotConfirmedException: 403,
    PasswordResetRequiredException: 403,
    UserNotFoundException: 404,
    TooManyRequestsException: 429,
    LimitExceededException: 429,
    TooManyFailedAttemptsException: 429,
}

function fromCognitoError(error) {
    const status = COGNITO_ERROR_STATUS[error?.name]
    if (!status) return serverError()
    return json(status, { message: error.message || error.name, code: error.name })
}

/* Reads and validates the JSON body of a proxy event.
   Throws SyntaxError on malformed JSON — let the handler map that to a 400. */
function parseBody(event) {
    if (!event?.body) return {}
    const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
    return JSON.parse(raw)
}

/* Returns the first missing field name, or null when everything is present. */
function missingField(payload, required = []) {
    for (const field of required) {
        const value = payload?.[field]
        if (value === undefined || value === null || String(value).trim() === '') return field
    }
    return null
}

/* Bearer token from the Authorization header, whatever its casing. */
function bearerToken(event) {
    const headers = event?.headers || {}
    const key = Object.keys(headers).find((h) => h.toLowerCase() === 'authorization')
    if (!key) return null
    const value = String(headers[key])
    return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value.trim()
}

/* Claims injected by the Cognito user pool authorizer, when there is one. */
function claims(event) {
    return event?.requestContext?.authorizer?.claims || null
}

module.exports = {
    json,
    ok,
    created,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    serverError,
    fromCognitoError,
    parseBody,
    missingField,
    bearerToken,
    claims,
}
