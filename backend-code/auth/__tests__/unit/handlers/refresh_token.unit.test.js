const { handler } = require('../../../handlers/refresh_token')

const REFRESH_TOKEN = 'eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIn0.opaque.payload'
// Deliberately not the `sub`: on a pool with an alias attribute the two
// differ, and only this one builds a SECRET_HASH Cognito accepts.
const USERNAME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const event = (body) => ({ body: body === undefined ? null : JSON.stringify(body) })

const authResult = (overrides = {}) => ({
    AuthenticationResult: { IdToken: 'new.id.token', ...overrides },
})

describe('POST /auth/refresh', () => {
    it('400s without a refresh token, without reaching Cognito', async () => {
        const cognito = { refreshTokens: jest.fn() }

        const result = await handler(event({}), { cognito })

        expect(result.statusCode).toBe(400)
        expect(cognito.refreshTokens).not.toHaveBeenCalled()
    })

    /**
     * The regression this endpoint shipped with: it called Cognito with the
     * refresh token alone. A refresh token is opaque, so the username could
     * not be recovered from it, no SECRET_HASH was built, and an app client
     * with a client secret answered NotAuthorizedException -> 401. Every
     * other flow worked, because every other flow already knew the username.
     */
    it('forwards the username so a SECRET_HASH can be built', async () => {
        const cognito = { refreshTokens: jest.fn(async () => authResult()) }

        const result = await handler(event({ refreshToken: REFRESH_TOKEN, username: USERNAME }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(cognito.refreshTokens).toHaveBeenCalledWith(REFRESH_TOKEN, USERNAME)
    })

    it('still works with no username, for a client that has no secret', async () => {
        const cognito = { refreshTokens: jest.fn(async () => authResult()) }

        const result = await handler(event({ refreshToken: REFRESH_TOKEN }), { cognito })

        expect(result.statusCode).toBe(200)
        expect(cognito.refreshTokens).toHaveBeenCalledWith(REFRESH_TOKEN, undefined)
    })

    it('echoes the presented refresh token back when Cognito does not rotate', async () => {
        const cognito = { refreshTokens: jest.fn(async () => authResult()) }

        const result = await handler(event({ refreshToken: REFRESH_TOKEN, username: USERNAME }), { cognito })

        expect(JSON.parse(result.body)).toEqual({
            idToken: 'new.id.token',
            refreshToken: REFRESH_TOKEN,
        })
    })

    it('returns the rotated refresh token when the pool issues one', async () => {
        const rotated = 'rotated.refresh.token'
        const cognito = { refreshTokens: jest.fn(async () => authResult({ RefreshToken: rotated })) }

        const result = await handler(event({ refreshToken: REFRESH_TOKEN, username: USERNAME }), { cognito })

        expect(JSON.parse(result.body).refreshToken).toBe(rotated)
    })

    it('maps a rejected refresh token to 401 rather than leaking the Cognito error', async () => {
        const error = new Error('Incorrect username or password.')
        error.name = 'NotAuthorizedException'
        const cognito = { refreshTokens: jest.fn(async () => { throw error }) }

        const result = await handler(event({ refreshToken: REFRESH_TOKEN, username: USERNAME }), { cognito })

        expect(result.statusCode).toBe(401)
        expect(JSON.parse(result.body).message).toBe('Incorrect credentials')
    })
})
