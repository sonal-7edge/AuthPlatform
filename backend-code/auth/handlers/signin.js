/* POST /auth/signin
   Authenticate a user and start a Cognito auth session

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement signin
        void payload

        return json(501, { message: 'signin is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('signin failed', error)
        return serverError()
    }
}
