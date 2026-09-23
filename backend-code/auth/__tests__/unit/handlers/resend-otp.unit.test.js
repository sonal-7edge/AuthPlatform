const { handler } = require('../../../handlers/resend-otp')
const { usernameFor } = require('../../../lib/helpers')

const EMAIL = 'ada@example.com'

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

describe('POST /auth/resend-otp', () => {
    it('400s without an identifier, without asking Cognito to send anything', async () => {
        const cognito = { resendConfirmationCode: jest.fn() }

        const result = await handler(event({}), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.resendConfirmationCode).not.toHaveBeenCalled()
    })

    it('400s on a missing body rather than throwing', async () => {
        const cognito = { resendConfirmationCode: jest.fn() }

        const result = await handler(event(), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.resendConfirmationCode).not.toHaveBeenCalled()
    })

    // Same pre-confirmation constraint as verify-otp: the alias is not
    // claimed yet, so only the derived username names this user.
    it('resends against the derived username, not the raw identifier', async () => {
        const cognito = { resendConfirmationCode: jest.fn(async () => ({})) }

        await handler(event({ identifier: EMAIL }), { cognito })

        expect(cognito.resendConfirmationCode).toHaveBeenCalledWith(usernameFor(EMAIL))
    })

    it('reaches the same user as verify-otp would for a differently cased address', async () => {
        const cognito = { resendConfirmationCode: jest.fn(async () => ({})) }

        await handler(event({ identifier: 'ADA@EXAMPLE.COM' }), { cognito })

        expect(cognito.resendConfirmationCode).toHaveBeenCalledWith(usernameFor(EMAIL))
    })

    it('confirms the resend', async () => {
        const cognito = {
            resendConfirmationCode: jest.fn(async () => ({
                CodeDeliveryDetails: { Destination: 'a***@e***', DeliveryMedium: 'EMAIL' },
            })),
        }

        const result = await handler(event({ identifier: EMAIL }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({ message: 'Verification code resent' })
    })

    // The handler logs CodeDeliveryDetails; a pool that reports none must
    // not turn a successful resend into a 500.
    it('still succeeds when Cognito reports no delivery details', async () => {
        const cognito = { resendConfirmationCode: jest.fn(async () => ({})) }

        const result = await handler(event({ identifier: EMAIL }), { cognito })

        expect(result.statusCode).toBe(200)
    })

    describe('Cognito failures', () => {
        it('maps the resend rate limit to 400', async () => {
            const cognito = {
                resendConfirmationCode: jest.fn(async () => { throw cognitoError('LimitExceededException') }),
            }

            const result = await handler(event({ identifier: EMAIL }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Too many attempts, please try again later')
        })

        it('maps an unknown user to 404', async () => {
            const cognito = {
                resendConfirmationCode: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
            }

            const result = await handler(event({ identifier: 'nobody@example.com' }), { cognito })

            expect(result.statusCode).toBe(404)
        })

        // Resending to a user who already confirmed is pointless, and
        // Cognito says so through NotAuthorizedException.
        it('tells an already-verified user to sign in', async () => {
            const cognito = {
                resendConfirmationCode: jest.fn(async () => {
                    throw cognitoError('NotAuthorizedException', 'User cannot be confirmed. Current status is CONFIRMED')
                }),
            }

            const result = await handler(event({ identifier: EMAIL }), { cognito })

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('Account is already verified — please sign in')
        })
    })
})
