const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

/**
 * POST /auth/verify-otp — { identifier, otp } -> { message }
 *
 * Spends the verification code Cognito emailed at sign-up, moving the user
 * from UNCONFIRMED to CONFIRMED.
 *
 * Deliberately returns no tokens: confirming an account is not the same as
 * authenticating, and this request carries no password to authenticate with.
 * The client signs in afterwards, which is one extra round trip in exchange
 * for never holding a password past sign-up.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.identifier || !body?.otp) {
        return badRequest('identifier and otp are required')
    }

    const cognito = deps.cognito || new Cognito()
    console.log('verify-otp: confirming', { identifier: body.identifier, otp: body.otp })
    await cognito.confirmSignUp({ username: body.identifier, code: body.otp })

    return ok({ message: 'Account verified — you can sign in now' })
})
