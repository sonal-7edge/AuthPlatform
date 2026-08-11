/* POST /auth/logout
   Globally sign the user out and revoke their tokens

   Protected by the cognito authorizer; the caller identity is on event.requestContext.authorizer. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement logout
        void payload

        return json(501, { message: 'logout is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('logout failed', error)
        return serverError()
    }
}
