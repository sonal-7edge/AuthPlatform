const Cognito = require('../lib/cognito')
const { withErrorHandling } = require('../lib/handler_wrapper')
const { ok, badRequest, parseBody, resolveIdentifier, usernameFor } = require('../lib/helpers')

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
 * Creates the user and leaves it UNCONFIRMED on purpose: that is what makes
 * Cognito send its own verification code, from the user pool's own message
 * configuration. verify_otp.js spends that code.
 *
 * The pool must list the matching attribute under AutoVerifiedAttributes
 * (email and/or phone_number) or Cognito accepts the sign-up and sends
 * nothing.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)
    const { identifier, identifier_type } = resolveIdentifier(body)

    if (!body?.firstName || !body?.lastName || !identifier || !body?.password) {
        return badRequest('firstName, lastName, email or phone, and password are required')
    }

    const cognito = deps.cognito || new Cognito()

    // The pool has email/phone as alias attributes, not username attributes,
    // so Cognito rejects an email- or phone-shaped Username on SignUp — hence
    // the derived one. It has to be derived rather than random: the alias
    // doesn't resolve while the user is UNCONFIRMED, so verify-otp and
    // resend-otp can only name this user by recomputing the same value.
    // Flows that run after confirmation (signin, forgot-password, ...) keep
    // passing `identifier` and let Cognito resolve the alias.
    const username = usernameFor(identifier)
    console.log('signUp: creating user', { username, identifier_type })

    const result = await cognito.signUp({
        username,
        password: body.password,
        user_attributes: buildUserAttributes({
            first_name: body.firstName,
            last_name: body.lastName,
            identifier,
            identifier_type,
        }),
    })

    // CodeDeliveryDetails is Cognito's own confirmation that it queued the
    // code for delivery, and to where. It's undefined here whenever the
    // pool's AutoVerifiedAttributes doesn't list the matching attribute —
    // SignUp still succeeds, but Cognito never sends anything.
    console.log('signUp: SignUpCommand result', {
        username,
        userConfirmed: result.UserConfirmed,
        codeDeliveryDetails: result.CodeDeliveryDetails,
    })

    return ok({
        message: identifier_type === 'phone'
            ? 'Verification code sent to your phone'
            : 'Verification code sent to your email',
    })
})
