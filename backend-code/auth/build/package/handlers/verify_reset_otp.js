const crypto = require('crypto')
const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')
const { signResetToken } = require('../lib/resetToken')

/**
 * Cognito's ConfirmForgotPassword call spends the code, but requires the
 * final new password in the same request. It just needs to satisfy the
 * pool's password policy — it's immediately discarded — so uppercase,
 * lowercase, digit and symbol are all forced regardless of the random bytes.
 */
function throwawayPassword() {
    return `${crypto.randomBytes(24).toString('base64')}Aa1!`
}

/**
 * POST /auth/verify-reset-otp — { identifier, otp } -> { resetToken }
 *
 * Cognito's ConfirmForgotPassword needs the new password at the same time as
 * the code, but the frontend contract splits "verify code" and "set new
 * password" into two separate calls. Bridge that by confirming here with a
 * throwaway random password (spends the code, proves it was correct), then
 * handing back a short-lived signed resetToken that reset_password.js trades
 * for the real new password via AdminSetUserPassword.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.identifier || !body?.otp) {
        return badRequest('identifier and otp are required')
    }

    const cognito = deps.cognito || new Cognito()
    await cognito.confirmForgotPassword({
        username: body.identifier,
        confirmation_code: body.otp,
        password: throwawayPassword(),
    })

    return ok({ resetToken: signResetToken(body.identifier) })
})
