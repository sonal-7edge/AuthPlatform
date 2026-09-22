const { handler } = require('../../../handlers/forgot_password')
const { usernameFor } = require('../../../lib/helpers')

const EMAIL = 'ada@example.com'
const PHONE = '+15551234567'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/forgot-password', () => {
    it('400s without an email or phone, without sending a code', async () => {
        const cognito = { forgotPassword: jest.fn() }

        const result = await handler(event({}), { cognito })

        expect(result.statusCode).toBe(400)
        expect(JSON.parse(result.body).message).toBe('email or phone is required')
        expect(cognito.forgotPassword).not.toHaveBeenCalled()
    })

    it('400s on a malformed JSON body rather than throwing a 500', async () => {
        const cognito = { forgotPassword: jest.fn() }

        const result = await handler({ body: '{not json' }, { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.forgotPassword).not.toHaveBeenCalled()
    })

    /**
     * Unlike sign-up's pre-confirmation handlers, this one runs against a
     * CONFIRMED user, so the alias resolves and Cognito takes the identifier
     * as typed.
     */
    it('starts the reset with the raw identifier, letting Cognito resolve the alias', async () => {
        const cognito = { forgotPassword: jest.fn(async () => ({})) }

        const result = await handler(event({ email: EMAIL }), { cognito })

        expect(cognito.forgotPassword).toHaveBeenCalledWith(EMAIL)
        expect(cognito.forgotPassword).not.toHaveBeenCalledWith(usernameFor(EMAIL))
        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({ message: 'Password reset code sent' })
    })

    it('accepts a phone identifier', async () => {
        const cognito = { forgotPassword: jest.fn(async () => ({})) }

        const result = await handler(event({ phone: PHONE }), { cognito })

        expect(cognito.forgotPassword).toHaveBeenCalledWith(PHONE)
        expect(result.statusCode).toBe(200)
    })

    it('prefers email when the client sends both', async () => {
        const cognito = { forgotPassword: jest.fn(async () => ({})) }

        await handler(event({ email: EMAIL, phone: PHONE }), { cognito })

        expect(cognito.forgotPassword).toHaveBeenCalledWith(EMAIL)
    })

    // Nothing here issues a reset token: the code has to come back through
    // verify-reset-otp first.
    it('returns only a message, never a reset token', async () => {
        const cognito = { forgotPassword: jest.fn(async () => ({})) }

        const result = await handler(event({ email: EMAIL }), { cognito })

        expect(Object.keys(JSON.parse(result.body))).toEqual(['message'])
    })

    describe('Cognito failures', () => {
        /**
         * Note this answers 404 for an address that has no account, which
         * makes the endpoint an account-existence oracle. Documenting the
         * behaviour as it stands — see the note in the review if that is to
         * change to a uniform 200.
         */
        it('maps an unknown identifier to 404', async () => {
            const cognito = {
                forgotPassword: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
            }

            const result = await handler(event({ email: 'nobody@example.com' }), { cognito })

            expect(result.statusCode).toBe(404)
            expect(JSON.parse(result.body).message).toBe('User not found')
        })

        it('maps the reset rate limit to 400', async () => {
            const cognito = {
                forgotPassword: jest.fn(async () => { throw cognitoError('LimitExceededException') }),
            }

            const result = await handler(event({ email: EMAIL }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Too many attempts, please try again later')
        })

        // A user who never confirmed cannot reset; Cognito raises
        // NotAuthorizedException rather than a code-specific error.
        it('maps a refused reset to 401', async () => {
            const cognito = {
                forgotPassword: jest.fn(async () => {
                    throw cognitoError('NotAuthorizedException', 'User password cannot be reset in the current state.')
                }),
            }

            const result = await handler(event({ email: EMAIL }), { cognito })

            expect(result.statusCode).toBe(401)
        })
    })
})
