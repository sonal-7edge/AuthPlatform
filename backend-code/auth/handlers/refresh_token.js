const Cognito = require('../lib/Cognito')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

/**
 * POST /auth/refresh — { refreshToken } -> { idToken, refreshToken }
 *
 * The payload only carries the refresh token (no username), so this only
 * works out of the box when the app client has no client secret configured
 * — SECRET_HASH can't be computed without the original username otherwise.
 * See README for the app-client configuration this assumes.
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
    const response = await cognito.refreshTokens(body.refreshToken)

    return ok({
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken || body.refreshToken,
    })
})
