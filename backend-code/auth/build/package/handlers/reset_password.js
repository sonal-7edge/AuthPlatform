const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, unauthorized, parseBody } = require('../lib/helpers')
const { verifyResetToken } = require('../lib/resetToken')

/**
 * POST /auth/reset-password — { resetToken, newPassword } -> { message }
 *
 * Trades the signed resetToken verify_reset_otp.js issued for the user's
 * real new password via AdminSetUserPassword (permanent — no Cognito
 * FORCE_CHANGE_PASSWORD status).
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.resetToken || !body?.newPassword) {
        return badRequest('resetToken and newPassword are required')
    }

    let identifier
    try {
        ({ identifier } = verifyResetToken(body.resetToken))
    } catch {
        return unauthorized('Reset link has expired or is invalid — please request a new one')
    }

    const cognito = deps.cognito || new Cognito()
    await cognito.adminSetUserPassword({ username: identifier, password: body.newPassword, permanent: true })

    return ok({ message: 'Password reset successfully' })
})
