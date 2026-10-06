const { handler } = require('../../../handlers/tokens')

/** A structurally valid (unsigned) id token — verification is stubbed out. */
function idTokenFor(claims) {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
    return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.signature`
}

const CLAIMS = {
    sub: 'e3f1c0a2-1111-2222-3333-444455556666',
    'cognito:username': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'ada@example.com',
    given_name: 'Ada',
    family_name: 'Lovelace',
}

const ID_TOKEN = idTokenFor(CLAIMS)

// `authorization: null` drops the header — passing undefined would just
// re-trigger the default below.
function event({ authorization = `Bearer ${ID_TOKEN}`, body } = {}) {
    return {
        headers: authorization ? { Authorization: authorization } : {},
        body: body === undefined ? null : JSON.stringify(body),
    }
}

const verifyIdToken = jest.fn(async () => CLAIMS)

beforeEach(() => {
    verifyIdToken.mockClear()
    verifyIdToken.mockImplementation(async () => CLAIMS)
})

describe('POST /auth/tokens', () => {
    it('401s with no Authorization header, without reaching Cognito', async () => {
        const cognito = { refreshTokens: jest.fn() }
        // The real verifier is what rejects a missing header, so let it.
        const { verifyIdToken: real } = require('../../../lib/verifyIdToken')

        const result = await handler(event({ authorization: null }), { verifyIdToken: real, cognito })

        expect(result.statusCode).toBe(401)
        expect(cognito.refreshTokens).not.toHaveBeenCalled()
    })

    it('401s when the token fails verification', async () => {
        verifyIdToken.mockImplementation(async () => {
            const error = new Error('Token expired')
            error.name = 'JwtExpiredError'
            throw error
        })

        const result = await handler(event(), { verifyIdToken })

        expect(result.statusCode).toBe(401)
    })

    it('returns the verified idToken and the profile from its claims', async () => {
        const result = await handler(event(), { verifyIdToken })

        expect(result.statusCode).toBe(200)
        expect(JSON.parse(result.body)).toEqual({
            idToken: ID_TOKEN,
            user: {
                id: CLAIMS.sub,
                firstName: 'Ada',
                lastName: 'Lovelace',
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                phone: undefined,
            },
        })
    })

    it('omits refreshToken when it has none, so the client keeps the stored one', async () => {
        const result = await handler(event(), { verifyIdToken })

        expect(Object.keys(JSON.parse(result.body))).not.toContain('refreshToken')
    })

    it('reads identity from the token, not the body', async () => {
        const result = await handler(
            event({ body: { email: 'attacker@example.com' } }),
            { verifyIdToken },
        )

        expect(JSON.parse(result.body).user.email).toBe('ada@example.com')
    })

    it('mints a fresh pair when the body carries a refreshToken', async () => {
        const fresh_id_token = idTokenFor({ ...CLAIMS, given_name: 'Ada' })
        const cognito = {
            refreshTokens: jest.fn(async () => ({
                AuthenticationResult: { IdToken: fresh_id_token, RefreshToken: 'rt_new' },
            })),
        }

        const result = await handler(event({ body: { refreshToken: 'rt_old' } }), { verifyIdToken, cognito })

        // Username comes from the verified claims, which is what makes
        // SECRET_HASH computable here but not in /auth/refresh.
        expect(cognito.refreshTokens).toHaveBeenCalledWith('rt_old', CLAIMS['cognito:username'])
        expect(JSON.parse(result.body)).toMatchObject({
            idToken: fresh_id_token,
            refreshToken: 'rt_new',
        })
    })

    it('echoes the supplied refreshToken when Cognito does not rotate it', async () => {
        const cognito = {
            refreshTokens: jest.fn(async () => ({
                AuthenticationResult: { IdToken: ID_TOKEN },
            })),
        }

        const result = await handler(event({ body: { refreshToken: 'rt_old' } }), { verifyIdToken, cognito })

        expect(JSON.parse(result.body).refreshToken).toBe('rt_old')
    })

    it('maps a revoked refresh token to 401', async () => {
        const cognito = {
            refreshTokens: jest.fn(async () => {
                const error = new Error('Refresh Token has been revoked')
                error.name = 'NotAuthorizedException'
                throw error
            }),
        }

        const result = await handler(event({ body: { refreshToken: 'rt_revoked' } }), { verifyIdToken, cognito })

        expect(result.statusCode).toBe(401)
    })
})
