/* POST /auth/signup
   Register a new user in the Cognito user pool

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement signup
        void payload

        return json(501, { message: 'signup is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('signup failed', error)
        return serverError()
    }
}
