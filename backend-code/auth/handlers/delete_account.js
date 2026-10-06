const Cognito = require('../lib/cognito')
const { verifyIdToken } = require('../lib/verify_id_token')
const { withErrorHandling } = require('../lib/handler_wrapper')
const { ok, badRequest, unauthorized, parseBody, getHeader } = require('../lib/helpers')

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
    // Same reasoning as change_password.js: say which credential failed.
    try {
        await cognito.adminVerifyPassword({ username, password: body.password })
    } catch (error) {
        if (error?.name === 'NotAuthorizedException') {
            return unauthorized('Password is incorrect')
        }
        throw error
    }

    await cognito.adminDeleteUser(username)

    return ok({ message: 'Account deleted successfully' })
})
