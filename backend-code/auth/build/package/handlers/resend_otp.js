const Cognito = require('../lib/Cognito')
const { getChallengeSessionStore } = require('../lib/challengeSessionStore')
const { withErrorHandling } = require('../lib/handlerWrapper')
const { ok, badRequest, parseBody } = require('../lib/helpers')

/**
 * POST /auth/resend-otp — { identifier } -> { message }
 *
 * There's no separate "resend" mechanism in the CUSTOM_AUTH chain — every
 * wrong answer to the OTP round makes create_auth_challenge.js issue a fresh
 * code (see verify_otp.js). Resend reuses that by submitting an answer that
 * can never match a real OTP hash, at the cost of one of the
 * MAX_OTP_ATTEMPTS retries (define_auth_challenge.js).
 */
module.exports.handler = withErrorHandling(async (event, deps = {}) => {
    const body = parseBody(event)

    if (!body?.identifier) {
        return badRequest('identifier is required')
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
        answer: '',
    })

    store.set(body.identifier, {
        ...pending,
        session: response.Session,
        challenge_name: response.ChallengeName,
    }, Number(process.env.OTP_TTL_SECONDS || 300))

    return ok({ message: 'OTP resent' })
})
