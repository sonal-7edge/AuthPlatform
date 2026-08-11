/* POST /auth/verify-otp
   Confirm sign-up with the emailed / texted one-time code

   Public route — no authorizer in front of it. */

const { json, badRequest, serverError } = require('../utils/helpers')

exports.handler = async (event) => {
    try {
        const payload = event.body ? JSON.parse(event.body) : {}

        // TODO: implement verify-otp
        void payload

        return json(501, { message: 'verify-otp is not implemented yet' })
    } catch (error) {
        if (error instanceof SyntaxError) return badRequest('Request body must be valid JSON.')
        console.error('verify-otp failed', error)
        return serverError()
    }
}
