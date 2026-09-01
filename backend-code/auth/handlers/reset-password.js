/* POST /auth/reset-password
   Complete the forgot-password flow with a new password

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement reset-password
        void payload

        return json(501, { message: 'reset-password is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('reset-password failed', error)
        return serverError()
    }
}
