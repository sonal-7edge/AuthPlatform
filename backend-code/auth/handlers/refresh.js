/* POST /auth/refresh
   Exchange a refresh token for a new access / id token

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement refresh
        void payload

        return json(501, { message: 'refresh is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('refresh failed', error)
        return serverError()
    }
}
