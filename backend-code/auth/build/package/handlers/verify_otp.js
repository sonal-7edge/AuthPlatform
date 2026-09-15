const Cognito = require('../lib/Cognito')
const { getChallengeSessionStore } = require('../lib/challengeSessionStore')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

function decodeIdTokenClaims(id_token) {
    const payload = id_token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
}

function toUser(claims) {
    const first_name = claims.given_name || ''
    const last_name = claims.family_name || ''
    return {
        id: claims.sub,
        firstName: first_name,
        lastName: last_name,
        name: [first_name, last_name].filter(Boolean).join(' '),
        email: claims.email,
        phone: claims.phone_number,
    }
}

/**
 * POST /auth/verify-otp — { identifier, otp } -> { idToken, refreshToken, user }
 *
 * Completes round 2 of the CUSTOM_AUTH chain started by sign_in.js /
 * sign_up.js. Same endpoint for both, since the challenge chain is
 * identical either way.
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.identifier || !body?.otp) {
        return badRequest('identifier and otp are required')
    }

    const store = deps.store || getChallengeSessionStore()
    const pending = store.get(body.identifier)

    if (!pending) {
        return badRequest('No pending verification for this identifier — please sign in again')
    }

    const cognito = deps.cognito || new Cognito()

    const response = await cognito.respondToAuthChallenge({
        username: body.identifier,
        session: pending.session,
        challenge_name: pending.challenge_name,
        answer: body.otp,
    })

    if (response.AuthenticationResult) {
        store.delete(body.identifier)
        const claims = decodeIdTokenClaims(response.AuthenticationResult.IdToken)
        return ok({
            idToken: response.AuthenticationResult.IdToken,
            refreshToken: response.AuthenticationResult.RefreshToken,
            user: toUser(claims),
        })
    }

    // Wrong code but retries remain — a fresh code was already sent by
    // create_auth_challenge; keep the new session so the next attempt works.
    store.set(body.identifier, {
        ...pending,
        session: response.Session,
        challenge_name: response.ChallengeName,
    }, Number(process.env.OTP_TTL_SECONDS || 300))

    return badRequest('Incorrect verification code — a new code has been sent')
})
