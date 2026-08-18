const crypto = require('crypto')
const Cognito = require('../lib/Cognito')

function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex')
}

/**
 * Cognito CUSTOM_AUTH trigger — validates the answer submitted for whichever
 * round is currently active.
 *   round 1 (password): privateChallengeParameters is empty; challengeAnswer
 *     carries the plaintext password, checked via AdminInitiateAuth.
 *   round 2 (OTP): privateChallengeParameters.otp_hash was set by
 *     create_auth_challenge; challengeAnswer carries the code the user typed.
 */
module.exports.handler = async (event, context, callback, deps = {}) => {
    const { challengeAnswer, privateChallengeParameters } = event.request
    const is_password_round = !privateChallengeParameters || !privateChallengeParameters.otp_hash

    if (is_password_round) {
        const cognito = deps.cognito || new Cognito()
        try {
            await cognito.adminVerifyPassword({ username: event.userName, password: challengeAnswer })
            event.response.answerCorrect = true
        } catch {
            event.response.answerCorrect = false
        }
        return event
    }

    event.response.answerCorrect = hashOtp(challengeAnswer || '') === privateChallengeParameters.otp_hash
    return event
}
