const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

/**
 * POST /auth/refresh — { refreshToken, username? } -> { idToken, refreshToken }
 *
 * `username` is optional and only matters when the app client has a client
 * secret: SECRET_HASH is an HMAC over the username, and a refresh token is
 * opaque to us, so there is no way to derive it here. auth-client sends the
 * `cognito:username` claim off the id_token it already holds. Omitting it
 * still works on a client with no secret, which is what this used to assume.
 *
 * Taking it from the body is not a trust decision — Cognito validates the
 * hash against the user the refresh token actually belongs to, so a forged
 * username fails the call rather than minting tokens for another account.
 *
 * Cognito refresh tokens don't rotate by default, so the same refreshToken
 * is echoed back unless the pool has refresh token rotation enabled.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.refreshToken) {
        return badRequest('refreshToken is required')
    }

    const cognito = deps.cognito || new Cognito()
    const response = await cognito.refreshTokens(body.refreshToken, body.username)

    return ok({
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken || body.refreshToken,
    })
})
