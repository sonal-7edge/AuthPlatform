const Cognito = require('../lib/cognito')
const { withErrorHandling } = require('../lib/handler_wrapper')
const { ok, badRequest, parseBody, usernameFor } = require('../lib/helpers')

/**
 * POST /auth/resend-otp — { identifier } -> { message }
 *
 * Re-sends the sign-up confirmation code (see verify_otp.js) for when the
 * original email/SMS was delayed or its code already expired.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.identifier) {
        return badRequest('identifier is required')
    }

    const cognito = deps.cognito || new Cognito()
    // Same pre-confirmation constraint as verify_otp.js: the alias isn't
    // claimed yet, so the user has to be named by its derived username.
    const response = await cognito.resendConfirmationCode(usernameFor(body.identifier))
    console.log('resend-otp: CodeDeliveryDetails', JSON.stringify(response.CodeDeliveryDetails))

    return ok({ message: 'Verification code resent' })
})
