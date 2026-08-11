/* POST /auth/delete-account
   Delete the signed-in user from the user pool

   Protected by the cognito authorizer; the caller identity is on event.requestContext.authorizer. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement delete-account
        void payload

        return json(501, { message: 'delete-account is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('delete-account failed', error)
        return serverError()
    }
}
