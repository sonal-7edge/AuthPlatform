const { handler } = require('../../../handlers/sign_in')
const { usernameFor } = require('../../../lib/helpers')

const EMAIL = 'ada@example.com'
const PHONE = '+15551234567'
const PASSWORD = 'Sup3rSecret!'

const CLAIMS = {
    sub: 'e3f1c0a2-1111-2222-3333-444455556666',
    email: EMAIL,
    given_name: 'Ada',
    family_name: 'Lovelace',
}

/** A structurally valid (unsigned) id token — sign-in only decodes it. */
function idTokenFor(claims) {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
    return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.signature`
}

const ID_TOKEN = idTokenFor(CLAIMS)

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const authResult = (overrides = {}) => ({
    AuthenticationResult: {
        IdToken: ID_TOKEN,
        RefreshToken: 'rt_issued',
        AccessToken: 'at_issued',
        ...overrides,
    },
})

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/signin', () => {
    it.each([
        ['email/phone', { password: PASSWORD }],
        ['password', { email: EMAIL }],
        ['both', {}],
    ])('400s when %s is missing, without reaching Cognito', async (_case, body) => {
        const cognito = { signIn: jest.fn() }

        const result = await handler(event(body), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.signIn).not.toHaveBeenCalled()
    })

    /**
     * The opposite of sign_up.js: by now the user is CONFIRMED, so the alias
     * resolves and Cognito is handed the identifier as typed. Deriving a
     * username here would name a user that does not exist.
     */
    it('signs in with the raw identifier, letting Cognito resolve the alias', async () => {
        const cognito = { signIn: jest.fn(async () => authResult()) }

        await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

        expect(cognito.signIn).toHaveBeenCalledWith({ username: EMAIL, password: PASSWORD })
        expect(cognito.signIn.mock.calls[0][0].username).not.toBe(usernameFor(EMAIL))
    })

    it('accepts a phone identifier the same way', async () => {
        const cognito = { signIn: jest.fn(async () => authResult()) }

        const result = await handler(event({ phone: PHONE, password: PASSWORD }), { cognito })

        expect(cognito.signIn).toHaveBeenCalledWith({ username: PHONE, password: PASSWORD })
        expect(result.statusCode).toBe(200)
    })

    it('returns both tokens and the profile decoded from the id token', async () => {
        const cognito = { signIn: jest.fn(async () => authResult()) }

        const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({
            idToken: ID_TOKEN,
            refreshToken: 'rt_issued',
            user: {
                id: CLAIMS.sub,
                firstName: 'Ada',
                lastName: 'Lovelace',
                name: 'Ada Lovelace',
                email: EMAIL,
            },
        })
    })

    // The access token is deliberately dropped: the client only ever holds
    // an idToken, which is why change-password and delete-account re-verify
    // the password instead of calling Cognito's user-scoped APIs.
    it('does not hand the access token to the client', async () => {
        const cognito = { signIn: jest.fn(async () => authResult()) }

        const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

        expect(Object.keys(JSON.parse(result.body))).not.toContain('accessToken')
    })

    it('builds a phone-only profile without inventing a name', async () => {
        const id_token = idTokenFor({ sub: CLAIMS.sub, phone_number: PHONE })
        const cognito = { signIn: jest.fn(async () => authResult({ IdToken: id_token })) }

        const result = await handler(event({ phone: PHONE, password: PASSWORD }), { cognito })

        expect(JSON.parse(result.body).user).toEqual({
            id: CLAIMS.sub,
            firstName: '',
            lastName: '',
            name: '',
            phone: PHONE,
        })
    })

    // Only reachable if the pool adds a challenge this endpoint does not
    // implement; better a named 400 than a crash on a missing result.
    it('400s with the challenge name when Cognito wants a second factor', async () => {
        const cognito = {
            signIn: jest.fn(async () => ({ ChallengeName: 'SMS_MFA', Session: 'sess' })),
        }

        const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

        expect(result.statusCode).toBe(400)
        expect(JSON.parse(result.body).message).toBe('Additional verification required: SMS_MFA')
    })

    describe('Cognito failures', () => {
        it('maps a wrong password to 401 with a non-committal message', async () => {
            const cognito = {
                signIn: jest.fn(async () => {
                    throw cognitoError('NotAuthorizedException', 'Incorrect username or password.')
                }),
            }

            const result = await handler(event({ email: EMAIL, password: 'wrong' }), { cognito })

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('Incorrect credentials')
        })

        // Tells the client to send the user back through verify-otp.
        it('maps an unconfirmed account to 400', async () => {
            const cognito = {
                signIn: jest.fn(async () => { throw cognitoError('UserNotConfirmedException') }),
            }

            const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Account is not confirmed')
        })

        it('maps a disabled account to 401 saying so', async () => {
            const cognito = {
                signIn: jest.fn(async () => {
                    throw cognitoError('NotAuthorizedException', 'User is disabled.')
                }),
            }

            const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('This account has been disabled')
        })

        it('maps an unknown user to 404', async () => {
            const cognito = {
                signIn: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
            }

            const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

            expect(result.statusCode).toBe(404)
        })

        it('maps rate limiting to 400', async () => {
            const cognito = {
                signIn: jest.fn(async () => { throw cognitoError('TooManyRequestsException') }),
            }

            const result = await handler(event({ email: EMAIL, password: PASSWORD }), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Too many attempts, please try again later')
        })
    })
})
