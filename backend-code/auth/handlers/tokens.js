/* POST /auth/tokens
   Exchange an authorization code / auth session for tokens

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement tokens
        void payload

        return json(501, { message: 'tokens is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('tokens failed', error)
        return serverError()
    }
}
