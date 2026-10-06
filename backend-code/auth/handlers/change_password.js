const Cognito = require('../lib/cognito')
const { verifyIdToken } = require('../lib/verify_id_token')
const { withErrorHandling } = require('../lib/handler_wrapper')
const { ok, badRequest, unauthorized, parseBody, getHeader } = require('../lib/helpers')

/**
 * POST /auth/change-password — Authorization: Bearer <idToken>,
 * { currentPassword, newPassword } -> { message }
 *
 * The client only ever holds an idToken, never an accessToken (see
 * verify_otp.js), so this can't use Cognito's own ChangePassword API, which
 * requires one. Verifies currentPassword the same way round 1 of sign-in
 * does (AdminInitiateAuth ADMIN_USER_PASSWORD_AUTH), then sets newPassword
 * via AdminSetUserPassword.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.currentPassword || !body?.newPassword) {
        return badRequest('currentPassword and newPassword are required')
    }

    const verify_id_token = deps.verifyIdToken || verifyIdToken
    const claims = await verify_id_token(getHeader(event, 'Authorization'))
    const username = claims['cognito:username'] || claims.sub

    const cognito = deps.cognito || new Cognito()
    // Distinguish "your current password is wrong" from every other 401 this
    // route can return — the request carries an idToken as well as a password,
    // so the wrapper's generic message cannot say which one was rejected.
    try {
        await cognito.adminVerifyPassword({ username, password: body.currentPassword })
    } catch (error) {
        if (error?.name === 'NotAuthorizedException') {
            return unauthorized('Current password is incorrect')
        }
        throw error
    }

    await cognito.adminSetUserPassword({ username, password: body.newPassword, permanent: true })

    return ok({ message: 'Password changed successfully' })
})
