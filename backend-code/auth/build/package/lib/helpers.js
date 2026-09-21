const crypto = require('crypto')

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
 * Cryptographically-random n-digit numeric OTP (default 6 digits), used by
 * create_auth_challenge.js for the OTP round of the custom-auth chain.
 */
function generateOtp(length = 6) {
    const max = 10 ** length
    const value = crypto.randomInt(0, max)
    return `${value}`.padStart(length, '0')
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

module.exports = {
    response,
    ok,
    badRequest,
    unauthorized,
    notFound,
    serverError,
    parseBody,
    generateOtp,
    resolveIdentifier,
    getHeader,
}
