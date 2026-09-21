const Cognito = require('../lib/Cognito')
const { verifyIdToken } = require('../lib/verifyIdToken')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, getHeader, parseBody, userFromIdToken } = require('../lib/helpers')

/**
 * POST /auth/tokens — Authorization: Bearer <idToken>, optional { refreshToken }
 *   -> { idToken, refreshToken?, user }
 *
 * Exchanges an established session for the tokens the frontend keeps in its
 * token store. `auth-client`'s `fetchTokens()` is what calls this, right
 * after signin, to move tokens into auth state (adopting an idToken is what
 * flips `isAuthenticated`).
 *
 * Identity comes from the Bearer idToken, never from the request body. The
 * body used to be the whole contract — `{email}` and nothing else — which is
 * why this handler was a deliberate 501: an email is not proof of anything,
 * so honouring it would have minted tokens for any account whose address you
 * could guess. `auth-client` 0.2.0 sends an empty body and relies on its
 * request interceptor to attach the stored idToken (httpClient.js exempts
 * only `/auth/refresh`), so there is now a verifiable caller to answer, and
 * the endpoint can be implemented without that hole.
 *
 * Two paths, both requiring a valid idToken first:
 *
 * - `{refreshToken}` present — mints a genuinely fresh pair off Cognito.
 *   Unlike `/auth/refresh`, the verified claims give us the username here, so
 *   SECRET_HASH is computable and this path works on an app client that has a
 *   client secret too.
 * - body empty (what the client sends today) — returns the verified idToken
 *   with the profile decoded from its claims. Nothing new is issued: without
 *   a password or refresh token there is nothing to mint from, and echoing a
 *   token the caller already presented and we just verified grants no access
 *   it didn't already have.
 *
 * Omitting `refreshToken` from the response on that second path is deliberate
 * — the client's `saveTokens()` merges into the stored set, so leaving the
 * key out preserves the refresh token signin saved instead of clobbering it.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event) || {}
    const auth_header = getHeader(event, 'Authorization')

    const verify_id_token = deps.verifyIdToken || verifyIdToken
    const claims = await verify_id_token(auth_header)

    if (body.refreshToken) {
        const cognito = deps.cognito || new Cognito()
        const username = claims['cognito:username'] || claims.sub
        const response = await cognito.refreshTokens(body.refreshToken, username)
        const id_token = response.AuthenticationResult.IdToken

        return ok({
            idToken: id_token,
            refreshToken: response.AuthenticationResult.RefreshToken || body.refreshToken,
            user: userFromIdToken(id_token),
        })
    }

    const id_token = auth_header.slice('Bearer '.length)

    return ok({
        idToken: id_token,
        user: userFromIdToken(id_token),
    })
})
