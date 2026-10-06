const { handler } = require('../../../handlers/verify_otp')
const { usernameFor } = require('../../../lib/helpers')

const EMAIL = 'ada@example.com'
const OTP = '123456'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/verify-otp', () => {
    it.each([
        ['identifier', { otp: OTP }],
        ['otp', { identifier: EMAIL }],
        ['both', {}],
    ])('400s when %s is missing, without spending a code', async (_case, body) => {
        const cognito = { confirmSignUp: jest.fn() }

        const result = await handler(event(body), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.confirmSignUp).not.toHaveBeenCalled()
    })

    /**
     * The bug this guards: the alias does not resolve while the user is
     * UNCONFIRMED — which is exactly the state this call ends. Passing the
     * raw identifier makes Cognito answer ExpiredCodeException, because it
     * will not admit the user was never found, so a correct code looks
     * expired. The user has to be named the way sign_up.js created it.
     */
    it('confirms the derived username, not the raw identifier', async () => {
        const cognito = { confirmSignUp: jest.fn(async () => ({})) }

        await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        expect(cognito.confirmSignUp).toHaveBeenCalledWith({
            username: usernameFor(EMAIL),
            code: OTP,
        })
        expect(cognito.confirmSignUp.mock.calls[0][0].username).not.toBe(EMAIL)
    })

    // The user retypes their address on this screen; a different case must
    // still resolve to the account sign-up created.
    it('matches the sign-up username despite different casing', async () => {
        const cognito = { confirmSignUp: jest.fn(async () => ({})) }

        await handler(event({ identifier: ' Ada@Example.COM ', otp: OTP }), { cognito })

        expect(cognito.confirmSignUp.mock.calls[0][0].username).toBe(usernameFor(EMAIL))
    })

    /**
     * Confirming an account is not authenticating, and this request carries
     * no password to authenticate with — the client signs in afterwards.
     */
    it('returns only a message, never tokens', async () => {
        const cognito = { confirmSignUp: jest.fn(async () => ({})) }

        const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({ message: 'Account verified — you can sign in now' })
    })

    describe('code failures', () => {
        it('maps a wrong code to 400', async () => {
            const cognito = {
                confirmSignUp: jest.fn(async () => { throw cognitoError('CodeMismatchException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: '000000' }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Incorrect verification code')
        })

        it('distinguishes an expired code from a wrong one', async () => {
            const cognito = {
                confirmSignUp: jest.fn(async () => { throw cognitoError('ExpiredCodeException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Verification code has expired')
        })

        // Cognito reuses NotAuthorizedException for an already-confirmed
        // user; the wording has to send them to sign-in, not back to a code.
        it('tells an already-verified user to sign in', async () => {
            const cognito = {
                confirmSignUp: jest.fn(async () => {
                    throw cognitoError('NotAuthorizedException', 'User cannot be confirmed. Current status is CONFIRMED')
                }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('Account is already verified — please sign in')
        })

        it('maps too many wrong attempts to 400', async () => {
            const cognito = {
                confirmSignUp: jest.fn(async () => { throw cognitoError('TooManyFailedAttemptsException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: '000000' }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Too many attempts, please try again later')
        })
    })
})
