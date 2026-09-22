// resetToken.js signs with this at call time; set it before the handler
// pulls the module in.
process.env.RESET_TOKEN_SECRET = 'test-reset-token-secret'

const { handler } = require('../../../handlers/reset_password')
const { signResetToken } = require('../../../lib/resetToken')

const EMAIL = 'ada@example.com'
const NEW_PASSWORD = 'Ev3nBetterSecret!'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/reset-password', () => {
    describe('validation', () => {
        it.each([
            ['resetToken', { newPassword: NEW_PASSWORD }],
            ['newPassword', { resetToken: signResetToken(EMAIL) }],
            ['both', {}],
        ])('400s when %s is missing, without setting a password', async (_case, body) => {
            const cognito = { adminSetUserPassword: jest.fn() }

            const result = await handler(event(body), { cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })
    })

    describe('reset token', () => {
        it('sets the password permanently for the identifier inside the token', async () => {
            const cognito = { adminSetUserPassword: jest.fn(async () => ({})) }

            const result = await handler(
                event({ resetToken: signResetToken(EMAIL), newPassword: NEW_PASSWORD }),
                { cognito },
            )

            // Permanent, so the user is not left in FORCE_CHANGE_PASSWORD.
            expect(cognito.adminSetUserPassword).toHaveBeenCalledWith({
                username: EMAIL,
                password: NEW_PASSWORD,
                permanent: true,
            })
            expect(result.statusCode).toBe(200)
            expect(JSON.parse(result.body)).toEqual({ message: 'Password reset successfully' })
        })

        it('401s on a malformed token', async () => {
            const cognito = { adminSetUserPassword: jest.fn() }

            const result = await handler(
                event({ resetToken: 'not-a-token', newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        it('401s when the signature does not match the payload', async () => {
            const cognito = { adminSetUserPassword: jest.fn() }
            const [payload] = signResetToken(EMAIL).split('.')

            const result = await handler(
                event({ resetToken: `${payload}.deadbeef`, newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        /**
         * The whole point of signing the token: without the signature check,
         * anyone holding their own valid reset token could swap the
         * identifier and take over another account.
         */
        it('401s when the identifier is swapped but the signature is kept', async () => {
            const cognito = { adminSetUserPassword: jest.fn() }
            const [, signature] = signResetToken(EMAIL).split('.')
            const forged = encode({ identifier: 'victim@example.com', expires_at: Date.now() + 600000 })

            const result = await handler(
                event({ resetToken: `${forged}.${signature}`, newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        // Short-lived by design — an old token left in an email or history
        // must not still reset the password.
        it('401s on an expired token', async () => {
            const cognito = { adminSetUserPassword: jest.fn() }
            const expired = signResetToken(EMAIL, -1)

            const result = await handler(
                event({ resetToken: expired, newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message)
                .toBe('Reset link has expired or is invalid — please request a new one')
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        // Expiry, forgery and malformed input all answer the same way, so
        // the response says nothing about which token was presented.
        it('answers identically for an invalid and an expired token', async () => {
            const cognito = { adminSetUserPassword: jest.fn() }

            const invalid = await handler(
                event({ resetToken: 'garbage.signature', newPassword: NEW_PASSWORD }),
                { cognito },
            )
            const expired = await handler(
                event({ resetToken: signResetToken(EMAIL, -1), newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(invalid.body).toBe(expired.body)
            expect(invalid.statusCode).toBe(expired.statusCode)
        })

        // Identity comes from the signed token alone.
        it('ignores an identifier supplied alongside the token', async () => {
            const cognito = { adminSetUserPassword: jest.fn(async () => ({})) }

            await handler(
                event({
                    resetToken: signResetToken(EMAIL),
                    newPassword: NEW_PASSWORD,
                    identifier: 'victim@example.com',
                }),
                { cognito },
            )

            expect(cognito.adminSetUserPassword).toHaveBeenCalledWith(
                expect.objectContaining({ username: EMAIL }),
            )
        })
    })

    describe('Cognito failures', () => {
        it('surfaces the pool password policy on a rejected password', async () => {
            const cognito = {
                adminSetUserPassword: jest.fn(async () => {
                    throw cognitoError('InvalidPasswordException', 'Password must have symbol characters')
                }),
            }

            const result = await handler(
                event({ resetToken: signResetToken(EMAIL), newPassword: 'weak' }),
                { cognito },
            )

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Password must have symbol characters')
        })

        it('maps a user deleted between the two calls to 404', async () => {
            const cognito = {
                adminSetUserPassword: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
            }

            const result = await handler(
                event({ resetToken: signResetToken(EMAIL), newPassword: NEW_PASSWORD }),
                { cognito },
            )

            expect(result.statusCode).toBe(404)
        })
    })
})
