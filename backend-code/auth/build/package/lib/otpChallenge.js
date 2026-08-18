const { getChallengeSessionStore } = require('./challengeSessionStore')

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 300)

/**
 * Kicks off the CUSTOM_AUTH challenge chain and drives it through round 1
 * (password) server-side, so the caller (sign_in.js / sign_up.js) only ever
 * needs to hand back a single "OTP sent" response. Stashes the Session
 * Cognito returns for round 2 (OTP) against the identifier for
 * verify_otp.js to complete later.
 *
 * Throws (NotAuthorizedException etc.) if the password is wrong — callers
 * rely on handlerWrapper's Cognito-error mapping to turn that into the
 * right HTTP response.
 */
async function startOtpChallenge({ cognito, store, identifier, identifier_type, password }) {
    const challenge_store = store || getChallengeSessionStore()

    const initiate_response = await cognito.initiateCustomAuth(identifier)

    const password_round = await cognito.respondToAuthChallenge({
        username: identifier,
        session: initiate_response.Session,
        challenge_name: initiate_response.ChallengeName,
        answer: password,
    })

    challenge_store.set(identifier, {
        session: password_round.Session,
        challenge_name: password_round.ChallengeName,
        identifier_type,
    }, OTP_TTL_SECONDS)
}

module.exports = { startOtpChallenge, OTP_TTL_SECONDS }
