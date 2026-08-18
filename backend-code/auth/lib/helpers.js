const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
}

function response(status_code, body) {
    return {
        statusCode: status_code,
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
    }
}

function ok(body) {
    return response(200, body)
}

function badRequest(message) {
    return response(400, { message })
}

function unauthorized(message = 'Unauthorized') {
    return response(401, { message })
}

function notFound(message = 'Not found') {
    return response(404, { message })
}

function serverError(message = 'Something went wrong, please try again') {
    return response(500, { message })
}

function parseBody(event) {
    try {
        return JSON.parse(event.body || '{}')
    } catch {
        return null
    }
}

/**
 * API Gateway may lower/upper-case header names depending on the source
 * (HTTP API vs REST API vs a direct test event) — look up case-insensitively.
 */
function getHeader(event, name) {
    const headers = event?.headers || {}
    const key = Object.keys(headers).find((header_name) => header_name.toLowerCase() === name.toLowerCase())
    return key ? headers[key] : undefined
}

/**
 * Resolves the { identifier, identifierType } pair the frontend contract
 * sends as either `email` or `phone` on signup/signin.
 */
function resolveIdentifier(body) {
    if (body?.email) {
        return { identifier: body.email, identifier_type: 'email' }
    }
    if (body?.phone) {
        return { identifier: body.phone, identifier_type: 'phone' }
    }
    return { identifier: undefined, identifier_type: undefined }
}

/**
 * Reads the profile the frontend contract expects straight out of the id
 * token, so returning a user alongside tokens costs no extra Cognito call.
 * The token is already signed by Cognito and verified by the API Gateway
 * authorizer on protected routes; here it is only being decoded.
 */
function userFromIdToken(id_token) {
    const payload = id_token.split('.')[1]
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    const first_name = claims.given_name || ''
    const last_name = claims.family_name || ''

    return {
        id: claims.sub,
        firstName: first_name,
        lastName: last_name,
        name: [first_name, last_name].filter(Boolean).join(' '),
        email: claims.email,
        phone: claims.phone_number,
    }
}

module.exports = {
    response,
    ok,
    badRequest,
    unauthorized,
    notFound,
    serverError,
    parseBody,
    resolveIdentifier,
    userFromIdToken,
    getHeader,
}
