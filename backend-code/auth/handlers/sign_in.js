const Cognito = require('../lib/cognito')
const { withErrorHandling } = require('../lib/handler_wrapper')
const { ok, badRequest, parseBody, resolveIdentifier, userFromIdToken } = require('../lib/helpers')

/**
 * POST /auth/signin — { email|phone, password } -> { idToken, refreshToken, user }
 *
 * Straight password authentication: Cognito returns tokens on the first call,
 * so there is no second step and nothing to carry between requests.
 *
 * An unconfirmed account raises UserNotConfirmedException, which
 * handler_wrapper maps to 400 "Account is not confirmed" — the client should
 * send the user back through verify-otp.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)
    const { identifier } = resolveIdentifier(body)

    if (!identifier || !body?.password) {
        return badRequest('email or phone, and password, are required')
    }

    const cognito = deps.cognito || new Cognito()
    const response = await cognito.signIn({ username: identifier, password: body.password })

    if (!response.AuthenticationResult) {
        // Only reachable if the pool adds a challenge (MFA, forced password
        // reset) that this endpoint does not implement.
        return badRequest(`Additional verification required: ${response.ChallengeName}`)
    }

    return ok({
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        user: userFromIdToken(response.AuthenticationResult.IdToken),
    })
})
