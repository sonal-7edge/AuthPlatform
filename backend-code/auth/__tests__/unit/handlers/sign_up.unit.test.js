const { handler } = require('../../../handlers/sign_up')
const { usernameFor } = require('../../../lib/helpers')

const EMAIL = 'ada@example.com'
const PHONE = '+15551234567'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const validBody = (overrides = {}) => ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: EMAIL,
    password: 'Sup3rSecret!',
    ...overrides,
})

/** Cognito's own SignUp reply; CodeDeliveryDetails is what confirms it sent. */
const signUpResult = (overrides = {}) => ({
    UserConfirmed: false,
    CodeDeliveryDetails: { Destination: 'a***@e***', DeliveryMedium: 'EMAIL' },
    ...overrides,
})

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

function attributeValue(user_attributes, name) {
    return user_attributes.find((attribute) => attribute.Name === name)?.Value
}

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /auth/signup', () => {
    describe('validation', () => {
        // Every field the contract requires, one missing at a time.
        it.each([
            ['firstName', { firstName: undefined }],
            ['lastName', { lastName: undefined }],
            ['email/phone', { email: undefined }],
            ['password', { password: undefined }],
        ])('400s when %s is missing, without reaching Cognito', async (_field, missing) => {
            const cognito = { signUp: jest.fn() }

            const result = await handler(event(validBody(missing)), { cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.signUp).not.toHaveBeenCalled()
        })

        it('400s on a malformed JSON body rather than throwing a 500', async () => {
            const cognito = { signUp: jest.fn() }

            const result = await handler({ body: '{not json' }, { cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.signUp).not.toHaveBeenCalled()
        })
    })

    describe('username derivation', () => {
        /**
         * The pool has email/phone as alias attributes, so an email-shaped
         * Username is rejected outright and the alias resolves to nobody
         * until the user is CONFIRMED. The derived username is the only
         * handle verify-otp and resend-otp can recompute.
         */
        it('creates the user under a derived username, never the raw identifier', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            await handler(event(validBody()), { cognito })

            const { username } = cognito.signUp.mock.calls[0][0]
            expect(username).toBe(usernameFor(EMAIL))
            expect(username).not.toBe(EMAIL)
        })

        // verify-otp recomputes this from whatever the user types next, so
        // casing and stray whitespace must not produce a different user.
        it('derives the same username regardless of case and surrounding space', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            await handler(event(validBody({ email: '  Ada@Example.COM  ' })), { cognito })

            expect(cognito.signUp.mock.calls[0][0].username).toBe(usernameFor(EMAIL))
        })
    })

    describe('attributes and confirmation message', () => {
        it('sends the name and email attributes for an email sign-up', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            const result = await handler(event(validBody()), { cognito })

            const { password, user_attributes } = cognito.signUp.mock.calls[0][0]
            expect(password).toBe('Sup3rSecret!')
            expect(attributeValue(user_attributes, 'given_name')).toBe('Ada')
            expect(attributeValue(user_attributes, 'family_name')).toBe('Lovelace')
            expect(attributeValue(user_attributes, 'email')).toBe(EMAIL)
            expect(attributeValue(user_attributes, 'phone_number')).toBeUndefined()
            expect(result.statusCode).toBe(200)
            expect(JSON.parse(result.body).message).toMatch(/email/i)
        })

        it('sends phone_number instead, and says so, for a phone sign-up', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            const result = await handler(
                event(validBody({ email: undefined, phone: PHONE })),
                { cognito },
            )

            const { user_attributes } = cognito.signUp.mock.calls[0][0]
            expect(attributeValue(user_attributes, 'phone_number')).toBe(PHONE)
            expect(attributeValue(user_attributes, 'email')).toBeUndefined()
            expect(JSON.parse(result.body).message).toMatch(/phone/i)
        })

        it('prefers email when the client sends both', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            await handler(event(validBody({ phone: PHONE })), { cognito })

            const { username, user_attributes } = cognito.signUp.mock.calls[0][0]
            expect(username).toBe(usernameFor(EMAIL))
            expect(attributeValue(user_attributes, 'email')).toBe(EMAIL)
        })

        // Cognito accepts the sign-up but silently sends nothing when the
        // pool's AutoVerifiedAttributes omits the attribute. The handler
        // still has to answer 200 — the account really was created.
        it('still succeeds when Cognito reports no code delivery', async () => {
            const cognito = {
                signUp: jest.fn(async () => signUpResult({ CodeDeliveryDetails: undefined })),
            }

            const result = await handler(event(validBody()), { cognito })

            expect(result.statusCode).toBe(200)
        })

        it('never returns tokens — the account is UNCONFIRMED at this point', async () => {
            const cognito = { signUp: jest.fn(async () => signUpResult()) }

            const result = await handler(event(validBody()), { cognito })

            expect(Object.keys(JSON.parse(result.body))).toEqual(['message'])
        })
    })

    describe('Cognito failures', () => {
        it('maps a duplicate account to 400', async () => {
            const cognito = {
                signUp: jest.fn(async () => { throw cognitoError('UsernameExistsException') }),
            }

            const result = await handler(event(validBody()), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('An account with that email/phone already exists')
        })

        // The pool's policy wording is the only useful thing to show here,
        // so this is the one Cognito message passed through verbatim.
        it('passes the password-policy message through on 400', async () => {
            const cognito = {
                signUp: jest.fn(async () => {
                    throw cognitoError('InvalidPasswordException', 'Password must have symbol characters')
                }),
            }

            const result = await handler(event(validBody()), { cognito })

            expect(result.statusCode).toBe(400)
            expect(JSON.parse(result.body).message).toBe('Password must have symbol characters')
        })

        it('answers 500 without leaking an unrecognised Cognito error', async () => {
            const cognito = {
                signUp: jest.fn(async () => { throw cognitoError('InternalErrorException', 'pool exploded') }),
            }

            const result = await handler(event(validBody()), { cognito })

            expect(result.statusCode).toBe(500)
            expect(result.body).not.toMatch(/pool exploded/)
        })
    })
})
