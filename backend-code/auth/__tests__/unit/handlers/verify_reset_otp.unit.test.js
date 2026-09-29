// reset_token.js signs with this at call time; set it before the handler
// pulls the module in.
process.env.RESET_TOKEN_SECRET = 'test-reset-token-secret'

const { handler } = require('../../../handlers/verify_reset_otp')
const { verifyResetToken } = require('../../../lib/reset_token')

const EMAIL = 'ada@example.com'
const OTP = '123456'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/verify-reset-otp', () => {
    it.each([
        ['identifier', { otp: OTP }],
        ['otp', { identifier: EMAIL }],
        ['both', {}],
    ])('400s when %s is missing, without spending a code', async (_case, body) => {
        const cognito = { confirmForgotPassword: jest.fn() }

        const result = await handler(event(body), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.confirmForgotPassword).not.toHaveBeenCalled()
    })

    /**
     * Cognito's ConfirmForgotPassword demands the new password in the same
     * request as the code, but the frontend splits "verify code" and "set
     * password" into two calls. The bridge is a throwaway password that
     * spends the code and is immediately discarded.
     */
    it('spends the code against the raw identifier', async () => {
        const cognito = { confirmForgotPassword: jest.fn(async () => ({})) }

        await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        expect(cognito.confirmForgotPassword).toHaveBeenCalledWith(
            expect.objectContaining({ username: EMAIL, confirmation_code: OTP }),
        )
    })

    // It has to clear the pool's policy or the confirm call fails and a
    // correct code looks wrong to the user.
    it('uses a throwaway password that satisfies a strict password policy', async () => {
        const cognito = { confirmForgotPassword: jest.fn(async () => ({})) }

        await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        const { password } = cognito.confirmForgotPassword.mock.calls[0][0]
        expect(password.length).toBeGreaterThanOrEqual(8)
        expect(password).toMatch(/[A-Z]/)
        expect(password).toMatch(/[a-z]/)
        expect(password).toMatch(/[0-9]/)
        expect(password).toMatch(/[^A-Za-z0-9]/)
    })

    // The account is briefly set to this value, so a predictable one would
    // be a window for anyone who could guess it.
    it('uses a different throwaway password on every call', async () => {
        const cognito = { confirmForgotPassword: jest.fn(async () => ({})) }

        await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })
        await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        const [first, second] = cognito.confirmForgotPassword.mock.calls.map((call) => call[0].password)
        expect(first).not.toBe(second)
    })

    it('never returns the throwaway password to the client', async () => {
        const cognito = { confirmForgotPassword: jest.fn(async () => ({})) }

        const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        const { password } = cognito.confirmForgotPassword.mock.calls[0][0]
        expect(result.body).not.toContain(password)
        expect(Object.keys(JSON.parse(result.body))).toEqual(['resetToken'])
    })

    it('hands back a reset token reset_password.js will accept for this identifier', async () => {
        const cognito = { confirmForgotPassword: jest.fn(async () => ({})) }

        const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(verifyResetToken(JSON.parse(result.body).resetToken)).toEqual({ identifier: EMAIL })
    })

    describe('code failures', () => {
        it('issues no reset token when the code is wrong', async () => {
            const cognito = {
                confirmForgotPassword: jest.fn(async () => { throw cognitoError('CodeMismatchException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: '000000' }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Incorrect verification code')
            expect(JSON.parse(result.body).resetToken).toBeUndefined()
        })

        it('distinguishes an expired code from a wrong one', async () => {
            const cognito = {
                confirmForgotPassword: jest.fn(async () => { throw cognitoError('ExpiredCodeException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: OTP }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Verification code has expired')
        })

        it('maps too many wrong attempts to 400', async () => {
            const cognito = {
                confirmForgotPassword: jest.fn(async () => { throw cognitoError('TooManyFailedAttemptsException') }),
            }

            const result = await handler(event({ identifier: EMAIL, otp: '000000' }), { cognito })

            expect(result.statusCode).toBe(400)
        })

        it('maps an unknown identifier to 404', async () => {
            const cognito = {
                confirmForgotPassword: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
            }

            const result = await handler(event({ identifier: 'nobody@example.com', otp: OTP }), { cognito })

            expect(result.statusCode).toBe(404)
        })
    })
})
