const Cognito = require('../lib/Cognito')
const { verifyIdToken } = require('../lib/verifyIdToken')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, getHeader } = require('../lib/helpers')

/**
 * POST /auth/logout — Authorization: Bearer <idToken> -> { message }
 *
 * Revokes every refresh token issued to this user (AdminUserGlobalSignOut),
 * so logout actually invalidates the session server-side instead of just
 * discarding tokens client-side.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const verify_id_token = deps.verifyIdToken || verifyIdToken
    const claims = await verify_id_token(getHeader(event, 'Authorization'))

    const cognito = deps.cognito || new Cognito()
    await cognito.globalSignOut(claims['cognito:username'] || claims.sub)

    return ok({ message: 'Signed out' })
})
