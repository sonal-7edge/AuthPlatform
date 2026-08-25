const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

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
    const response = await cognito.resendConfirmationCode(body.identifier)
    console.log('resend-otp: CodeDeliveryDetails', JSON.stringify(response.CodeDeliveryDetails))

    return ok({ message: 'Verification code resent' })
})
