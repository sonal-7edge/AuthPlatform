const Cognito = require('../lib/Cognito')
const { verifyIdToken } = require('../lib/verifyIdToken')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody, getHeader } = require('../lib/helpers')

/**
 * POST /auth/delete-account — Authorization: Bearer <idToken>, { password } -> { message }
 *
 * Re-verifies the password (AdminInitiateAuth ADMIN_USER_PASSWORD_AUTH, the
 * same check round 1 of sign-in uses) before calling AdminDeleteUser —
 * deletion is irreversible, so a stolen idToken alone shouldn't be enough.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.password) {
        return badRequest('password is required')
    }

    const verify_id_token = deps.verifyIdToken || verifyIdToken
    const claims = await verify_id_token(getHeader(event, 'Authorization'))
    const username = claims['cognito:username'] || claims.sub

    const cognito = deps.cognito || new Cognito()
    await cognito.adminVerifyPassword({ username, password: body.password })
    await cognito.adminDeleteUser(username)

    return ok({ message: 'Account deleted successfully' })
})
