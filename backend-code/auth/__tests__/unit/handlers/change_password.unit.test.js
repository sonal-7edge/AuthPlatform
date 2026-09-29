const { handler } = require('../../../handlers/change_password')

const CLAIMS = {
    sub: 'e3f1c0a2-1111-2222-3333-444455556666',
    'cognito:username': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'ada@example.com',
}

const CURRENT = 'Sup3rSecret!'
const NEXT = 'Ev3nBetterSecret!'

// `authorization: null` drops the header — passing undefined would just
// re-trigger the default below.
function event({ authorization = 'Bearer id.token.here', body } = {}) {
    return {
        headers: authorization ? { Authorization: authorization } : {},
        body: body === undefined ? null : JSON.stringify(body),
    }
}

const validBody = (overrides = {}) => ({
    currentPassword: CURRENT,
    newPassword: NEXT,
    ...overrides,
})

const verifyIdToken = jest.fn(async () => CLAIMS)

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

/** Happy-path double: both calls succeed. */
const workingCognito = () => ({
    adminVerifyPassword: jest.fn(async () => undefined),
    adminSetUserPassword: jest.fn(async () => ({})),
})

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

beforeEach(() => {
    verifyIdToken.mockImplementation(async () => CLAIMS)
})

describe('POST /auth/change-password', () => {
    describe('validation', () => {
        it.each([
            ['currentPassword', { currentPassword: undefined }],
            ['newPassword', { newPassword: undefined }],
        ])('400s when %s is missing', async (_field, missing) => {
            const cognito = workingCognito()

            const result = await handler(event({ body: validBody(missing) }), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.adminVerifyPassword).not.toHaveBeenCalled()
        })

        // Body validation runs first, so an incomplete request costs no
        // JWKS fetch.
        it('rejects an incomplete body before verifying the token', async () => {
            const cognito = workingCognito()

            await handler(event({ body: {} }), { verifyIdToken, cognito })

            expect(verifyIdToken).not.toHaveBeenCalled()
        })
    })

    describe('authentication', () => {
        it('401s with no Authorization header, without touching the password', async () => {
            const cognito = workingCognito()
            // The real verifier is what rejects a missing header, so let it.
            const { verifyIdToken: real } = require('../../../lib/verify_id_token')

            const result = await handler(
                event({ authorization: null, body: validBody() }),
                { verifyIdToken: real, cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        it('401s on a token that fails verification', async () => {
            const cognito = workingCognito()
            verifyIdToken.mockImplementation(async () => {
                throw cognitoError('JwtInvalidSignatureError', 'Invalid signature')
            })

            const result = await handler(event({ body: validBody() }), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(401)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })
    })

    describe('re-verifying the current password', () => {
        /**
         * The client only ever holds an idToken, so Cognito's own
         * ChangePassword API (which needs an accessToken) is unusable here.
         * Running sign-in's password check means a stolen idToken alone
         * cannot change a password.
         */
        it('verifies the current password before setting the new one', async () => {
            const cognito = workingCognito()

            const result = await handler(event({ body: validBody() }), { verifyIdToken, cognito })

            expect(cognito.adminVerifyPassword).toHaveBeenCalledWith({
                username: CLAIMS['cognito:username'],
                password: CURRENT,
            })
            expect(cognito.adminSetUserPassword).toHaveBeenCalledWith({
                username: CLAIMS['cognito:username'],
                password: NEXT,
                permanent: true,
            })
            expect(cognito.adminVerifyPassword.mock.invocationCallOrder[0])
                .toBeLessThan(cognito.adminSetUserPassword.mock.invocationCallOrder[0])
            expect(result.statusCode).toBe(200)
            expect(JSON.parse(result.body)).toEqual({ message: 'Password changed successfully' })
        })

        /**
         * The wrapper's generic 401 cannot say which credential failed —
         * this request carries an idToken *and* a password — so the handler
         * catches NotAuthorizedException itself to name the password.
         */
        it('401s naming the current password, and leaves the password unchanged', async () => {
            const cognito = workingCognito()
            cognito.adminVerifyPassword.mockImplementation(async () => {
                throw cognitoError('NotAuthorizedException', 'Incorrect username or password.')
            })

            const result = await handler(
                event({ body: validBody({ currentPassword: 'wrong' }) }),
                { verifyIdToken, cognito },
            )

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('Current password is incorrect')
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })

        // Only NotAuthorizedException is special-cased; anything else has to
        // keep its own mapping rather than be reported as a bad password.
        it('lets a non-credential failure keep its own status', async () => {
            const cognito = workingCognito()
            cognito.adminVerifyPassword.mockImplementation(async () => {
                throw cognitoError('UserNotFoundException')
            })

            const result = await handler(event({ body: validBody() }), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(404)
            expect(cognito.adminSetUserPassword).not.toHaveBeenCalled()
        })
    })

    it('falls back to sub when the token carries no cognito:username', async () => {
        const cognito = workingCognito()
        verifyIdToken.mockImplementation(async () => ({ sub: CLAIMS.sub, email: CLAIMS.email }))

        await handler(event({ body: validBody() }), { verifyIdToken, cognito })

        expect(cognito.adminVerifyPassword).toHaveBeenCalledWith({ username: CLAIMS.sub, password: CURRENT })
        expect(cognito.adminSetUserPassword).toHaveBeenCalledWith({
            username: CLAIMS.sub,
            password: NEXT,
            permanent: true,
        })
    })

    // The identity comes from the verified token; a username in the body is
    // not an input this route honours.
    it('ignores a username supplied in the body', async () => {
        const cognito = workingCognito()

        await handler(
            event({ body: validBody({ username: 'victim@example.com' }) }),
            { verifyIdToken, cognito },
        )

        expect(cognito.adminSetUserPassword).toHaveBeenCalledWith({
            username: CLAIMS['cognito:username'],
            password: NEXT,
            permanent: true,
        })
    })

    it('surfaces the pool password policy when the new password is rejected', async () => {
        const cognito = workingCognito()
        cognito.adminSetUserPassword.mockImplementation(async () => {
            throw cognitoError('InvalidPasswordException', 'Password must have symbol characters')
        })

        const result = await handler(event({ body: validBody({ newPassword: 'weak' }) }), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(400)
        expect(JSON.parse(result.body).message).toBe('Password must have symbol characters')
    })
})
