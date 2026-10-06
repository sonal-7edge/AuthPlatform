const { handler } = require('../../../handlers/delete_account')

const CLAIMS = {
    sub: 'e3f1c0a2-1111-2222-3333-444455556666',
    'cognito:username': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'ada@example.com',
}

const PASSWORD = 'Sup3rSecret!'

// `authorization: null` drops the header — passing undefined would just
// re-trigger the default below.
function event({ authorization = 'Bearer id.token.here', body = { password: PASSWORD } } = {}) {
    return {
        headers: authorization ? { Authorization: authorization } : {},
        body: body === null ? null : JSON.stringify(body),
    }
}

const verifyIdToken = jest.fn(async () => CLAIMS)

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

/** Happy-path double: both calls succeed. */
const workingCognito = () => ({
    adminVerifyPassword: jest.fn(async () => undefined),
    adminDeleteUser: jest.fn(async () => ({})),
})

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

beforeEach(() => {
    verifyIdToken.mockImplementation(async () => CLAIMS)
})

describe('POST /auth/delete-account', () => {
    describe('validation', () => {
        it('400s without a password, and deletes nothing', async () => {
            const cognito = workingCognito()

            const result = await handler(event({ body: {} }), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.adminDeleteUser).not.toHaveBeenCalled()
        })

        it('rejects an empty body before verifying the token', async () => {
            const cognito = workingCognito()

            await handler(event({ body: null }), { verifyIdToken, cognito })

            expect(verifyIdToken).not.toHaveBeenCalled()
        })
    })

    describe('authentication', () => {
        it('401s with no Authorization header, and deletes nothing', async () => {
            const cognito = workingCognito()
            // The real verifier is what rejects a missing header, so let it.
            const { verifyIdToken: real } = require('../../../lib/verify_id_token')

            const result = await handler(event({ authorization: null }), { verifyIdToken: real, cognito })

            expect(result.statusCode).toBe(401)
            expect(cognito.adminDeleteUser).not.toHaveBeenCalled()
        })

        it('401s on a token that fails verification, and deletes nothing', async () => {
            const cognito = workingCognito()
            verifyIdToken.mockImplementation(async () => {
                throw cognitoError('JwtExpiredError', 'Token expired')
            })

            const result = await handler(event(), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(401)
            expect(cognito.adminDeleteUser).not.toHaveBeenCalled()
        })
    })

    describe('re-verifying the password', () => {
        /**
         * Deletion is irreversible, so a stolen idToken alone must not be
         * enough — the password is checked the same way round 1 of sign-in
         * checks it, before AdminDeleteUser runs.
         */
        it('verifies the password before deleting, and reports success', async () => {
            const cognito = workingCognito()

            const result = await handler(event(), { verifyIdToken, cognito })

            expect(cognito.adminVerifyPassword).toHaveBeenCalledWith({
                username: CLAIMS['cognito:username'],
                password: PASSWORD,
            })
            expect(cognito.adminDeleteUser).toHaveBeenCalledWith(CLAIMS['cognito:username'])
            expect(cognito.adminVerifyPassword.mock.invocationCallOrder[0])
                .toBeLessThan(cognito.adminDeleteUser.mock.invocationCallOrder[0])
            expect(result.statusCode).toBe(200)
            expect(JSON.parse(result.body)).toEqual({ message: 'Account deleted successfully' })
        })

        // The one that matters most on this route: a valid token plus a
        // wrong password must not destroy the account.
        it('401s on a wrong password and does not delete the account', async () => {
            const cognito = workingCognito()
            cognito.adminVerifyPassword.mockImplementation(async () => {
                throw cognitoError('NotAuthorizedException', 'Incorrect username or password.')
            })

            const result = await handler(event({ body: { password: 'wrong' } }), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(401)
            expect(JSON.parse(result.body).message).toBe('Password is incorrect')
            expect(cognito.adminDeleteUser).not.toHaveBeenCalled()
        })

        it('does not delete when the password check fails for any other reason', async () => {
            const cognito = workingCognito()
            cognito.adminVerifyPassword.mockImplementation(async () => {
                throw cognitoError('TooManyRequestsException')
            })

            const result = await handler(event(), { verifyIdToken, cognito })

            expect(result.statusCode).toBe(400)
            expect(cognito.adminDeleteUser).not.toHaveBeenCalled()
        })
    })

    it('falls back to sub when the token carries no cognito:username', async () => {
        const cognito = workingCognito()
        verifyIdToken.mockImplementation(async () => ({ sub: CLAIMS.sub, email: CLAIMS.email }))

        await handler(event(), { verifyIdToken, cognito })

        expect(cognito.adminDeleteUser).toHaveBeenCalledWith(CLAIMS.sub)
    })

    // Identity comes from the verified token, so naming someone else in the
    // body cannot redirect the deletion.
    it('deletes the token holder, not a username supplied in the body', async () => {
        const cognito = workingCognito()

        await handler(
            event({ body: { password: PASSWORD, username: 'victim@example.com' } }),
            { verifyIdToken, cognito },
        )

        expect(cognito.adminDeleteUser).toHaveBeenCalledWith(CLAIMS['cognito:username'])
    })

    it('reports 500 when the deletion itself fails, without claiming success', async () => {
        const cognito = workingCognito()
        cognito.adminDeleteUser.mockImplementation(async () => {
            throw cognitoError('InternalErrorException', 'pool exploded')
        })

        const result = await handler(event(), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(500)
        expect(result.body).not.toMatch(/pool exploded/)
    })
})
