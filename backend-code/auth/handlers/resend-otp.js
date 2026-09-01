/* POST /auth/resend-otp
   Resend the sign-up confirmation code

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement resend-otp
        void payload

        return json(501, { message: 'resend-otp is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('resend-otp failed', error)
        return serverError()
    }
}
