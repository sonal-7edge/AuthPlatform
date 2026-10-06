const crypto = require('crypto')

const RESET_TOKEN_TTL_SECONDS = Number(process.env.RESET_TOKEN_TTL_SECONDS || 600)

function sign(encoded_payload) {
    return crypto
        .createHmac('sha256', process.env.RESET_TOKEN_SECRET)
        .update(encoded_payload)
        .digest('base64url')
}

/**
 * Signed, short-lived token bridging verify_reset_otp.js (which spends the
 * Cognito confirmation code) and reset_password.js (which sets the real new
 * password) — see README's forgot-password design note for why these are
 * two separate calls instead of one ConfirmForgotPassword.
 */
function signResetToken(identifier, ttl_seconds = RESET_TOKEN_TTL_SECONDS) {
    const encoded_payload = Buffer.from(JSON.stringify({
        identifier,
        expires_at: Date.now() + ttl_seconds * 1000,
    })).toString('base64url')

    return `${encoded_payload}.${sign(encoded_payload)}`
}

function verifyResetToken(token) {
    const [encoded_payload, signature] = String(token).split('.')
    if (!encoded_payload || !signature) {
        throw new Error('Malformed reset token')
    }

    const provided = Buffer.from(signature)
    const expected = Buffer.from(sign(encoded_payload))
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        throw new Error('Invalid reset token signature')
    }

    const { identifier, expires_at } = JSON.parse(Buffer.from(encoded_payload, 'base64url').toString('utf8'))
    if (expires_at < Date.now()) {
        throw new Error('Reset token has expired')
    }

    return { identifier }
}

module.exports = { signResetToken, verifyResetToken, RESET_TOKEN_TTL_SECONDS }
