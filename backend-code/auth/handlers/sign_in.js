const Cognito = require('../lib/Cognito')
const { startOtpChallenge } = require('../lib/otpChallenge')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody, resolveIdentifier } = require('../lib/helpers')

/**
 * POST /auth/signin — { email|phone, password } -> { message }
 *
 * Verifies the password and kicks off the OTP round in one request; the
 * client never sees the intermediate password-challenge round trip.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)
    const { identifier, identifier_type } = resolveIdentifier(body)

    if (!identifier || !body?.password) {
        return badRequest('email or phone, and password, are required')
    }

    const cognito = deps.cognito || new Cognito()

    await startOtpChallenge({
        cognito,
        store: deps.store,
        identifier,
        identifier_type,
        password: body.password,
    })

    return ok({ message: 'OTP sent to your registered contact' })
})
