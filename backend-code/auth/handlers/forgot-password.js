/* POST /auth/forgot-password
   Start the forgot-password flow and send a reset code

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement forgot-password
        void payload

        return json(501, { message: 'forgot-password is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('forgot-password failed', error)
        return serverError()
    }
}
