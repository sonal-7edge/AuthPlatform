const Cognito = require('../lib/Cognito')
const { verifyIdToken } = require('../lib/verifyIdToken')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody, getHeader } = require('../lib/helpers')

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
    await cognito.adminVerifyPassword({ username, password: body.currentPassword })
    await cognito.adminSetUserPassword({ username, password: body.newPassword, permanent: true })

    return ok({ message: 'Password changed successfully' })
})
