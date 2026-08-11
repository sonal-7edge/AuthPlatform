const Cognito = require('../lib/Cognito')
const { startOtpChallenge } = require('../lib/otpChallenge')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody, resolveIdentifier } = require('../lib/helpers')

function buildUserAttributes({ first_name, last_name, identifier, identifier_type }) {
    return [
        { Name: 'given_name', Value: first_name },
        { Name: 'family_name', Value: last_name },
        { Name: identifier_type === 'phone' ? 'phone_number' : 'email', Value: identifier },
    ]
}

/**
 * POST /auth/signup — { firstName, lastName, email|phone, password } -> { message }
 *
 * Creates the Cognito user and confirms it server-side (AdminConfirmSignUp)
 * so Cognito's own confirmation code is never sent — there is only ever one
 * OTP mechanism in the system (the custom-auth challenge chain), and the
 * newly-created user goes straight into the same OTP round sign_in.js uses,
 * so verify_otp.js is the single completion point for both flows.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)
    const { identifier, identifier_type } = resolveIdentifier(body)

    if (!body?.firstName || !body?.lastName || !identifier || !body?.password) {
        return badRequest('firstName, lastName, email or phone, and password are required')
    }

    const cognito = deps.cognito || new Cognito()

    await cognito.signUp({
        username: identifier,
        password: body.password,
        user_attributes: buildUserAttributes({
            first_name: body.firstName,
            last_name: body.lastName,
            identifier,
            identifier_type,
        }),
    })
    await cognito.adminConfirmSignUp(identifier)

    await startOtpChallenge({
        cognito,
        store: deps.store,
        identifier,
        identifier_type,
        password: body.password,
    })

    return ok({ message: identifier_type === 'phone' ? 'OTP sent to your phone' : 'OTP sent to your email' })
})
