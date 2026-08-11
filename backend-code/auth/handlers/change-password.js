/* POST /auth/change-password
   Change the password of the signed-in user

   Protected by the cognito authorizer; the caller identity is on event.requestContext.authorizer. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement change-password
        void payload

        return json(501, { message: 'change-password is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('change-password failed', error)
        return serverError()
    }
}
