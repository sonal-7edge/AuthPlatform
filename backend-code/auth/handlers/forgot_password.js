const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody, resolveIdentifier } = require('../lib/helpers')

/**
 * POST /auth/forgot-password — { email|phone } -> { message }
 *
 * Kicks off Cognito's native ForgotPassword flow — the confirmation code is
 * delivered by whatever medium the pool has configured, not the custom-auth
 * OTP chain sign_in.js/sign_up.js use (there's no password to verify first
 * here, so that chain doesn't apply). verify_reset_otp.js completes it.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)
    const { identifier } = resolveIdentifier(body)

    if (!identifier) {
        return badRequest('email or phone is required')
    }

    const cognito = deps.cognito || new Cognito()
    await cognito.forgotPassword(identifier)

    return ok({ message: 'Password reset code sent' })
})
