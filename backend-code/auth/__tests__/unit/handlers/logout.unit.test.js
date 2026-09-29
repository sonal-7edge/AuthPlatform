const { handler } = require('../../../handlers/logout')

const CLAIMS = {
    sub: 'e3f1c0a2-1111-2222-3333-444455556666',
    'cognito:username': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'ada@example.com',
}

// `authorization: null` drops the header — passing undefined would just
// re-trigger the default below.
function event({ authorization = 'Bearer id.token.here' } = {}) {
    return { headers: authorization ? { Authorization: authorization } : {}, body: null }
}

const verifyIdToken = jest.fn(async () => CLAIMS)

const cognitoError = (name, message = name) => {
    const error = new Error(message)
    error.name = name
    return error
}

beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

beforeEach(() => {
    verifyIdToken.mockImplementation(async () => CLAIMS)
})

describe('POST /auth/logout', () => {
    it('401s with no Authorization header, without revoking anything', async () => {
        const cognito = { globalSignOut: jest.fn() }
        // The real verifier is what rejects a missing header, so let it.
        const { verifyIdToken: real } = require('../../../lib/verify_id_token')

        const result = await handler(event({ authorization: null }), { verifyIdToken: real, cognito })

        expect(result.statusCode).toBe(401)
        expect(cognito.globalSignOut).not.toHaveBeenCalled()
    })

    it('401s on an Authorization header that is not a Bearer token', async () => {
        const cognito = { globalSignOut: jest.fn() }
        const { verifyIdToken: real } = require('../../../lib/verify_id_token')

        const result = await handler(event({ authorization: 'Basic dXNlcjpwYXNz' }), { verifyIdToken: real, cognito })

        expect(result.statusCode).toBe(401)
        expect(cognito.globalSignOut).not.toHaveBeenCalled()
    })

    it('401s on an expired token, without revoking anything', async () => {
        const cognito = { globalSignOut: jest.fn() }
        verifyIdToken.mockImplementation(async () => {
            throw cognitoError('JwtExpiredError', 'Token expired')
        })

        const result = await handler(event(), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(401)
        expect(cognito.globalSignOut).not.toHaveBeenCalled()
    })

    // API Gateway casing varies by integration type, so the header lookup
    // is case-insensitive; a lowercased header must still authenticate.
    it('accepts a lowercased authorization header', async () => {
        const cognito = { globalSignOut: jest.fn(async () => ({})) }

        const result = await handler(
            { headers: { authorization: 'Bearer id.token.here' }, body: null },
            { verifyIdToken, cognito },
        )

        expect(result.statusCode).toBe(200)
        expect(verifyIdToken).toHaveBeenCalledWith('Bearer id.token.here')
    })

    /**
     * Revoking every refresh token server-side is the point of the route —
     * discarding tokens client-side would leave the session usable.
     */
    it('globally signs out the username from the verified claims', async () => {
        const cognito = { globalSignOut: jest.fn(async () => ({})) }

        const result = await handler(event(), { verifyIdToken, cognito })

        expect(cognito.globalSignOut).toHaveBeenCalledWith(CLAIMS['cognito:username'])
        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({ message: 'Signed out' })
    })

    // Not every pool populates cognito:username in the id token.
    it('falls back to sub when the token carries no cognito:username', async () => {
        const cognito = { globalSignOut: jest.fn(async () => ({})) }
        verifyIdToken.mockImplementation(async () => ({ sub: CLAIMS.sub, email: CLAIMS.email }))

        await handler(event(), { verifyIdToken, cognito })

        expect(cognito.globalSignOut).toHaveBeenCalledWith(CLAIMS.sub)
    })

    it('maps a rejected sign-out to 401 rather than reporting success', async () => {
        const cognito = {
            globalSignOut: jest.fn(async () => { throw cognitoError('NotAuthorizedException') }),
        }

        const result = await handler(event(), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(401)
    })

    it('maps a deleted user to 404', async () => {
        const cognito = {
            globalSignOut: jest.fn(async () => { throw cognitoError('UserNotFoundException') }),
        }

        const result = await handler(event(), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(404)
    })
})
