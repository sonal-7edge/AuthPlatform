/* POST /auth/verify-reset-otp
   Validate the password reset code before accepting a new password

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement verify-reset-otp
        void payload

        return json(501, { message: 'verify-reset-otp is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('verify-reset-otp failed', error)
        return serverError()
    }
}
