const MAX_OTP_ATTEMPTS = 3

/**
 * Cognito CUSTOM_AUTH trigger — decides what happens next in the challenge
 * chain based on the rounds already completed (event.request.session):
 *   [] -> issue the password round
 *   [password:pass] -> issue the OTP round
 *   [password:fail] -> fail immediately (bad credentials)
 *   [password:pass, otp:pass] -> issue tokens
 *   [password:pass, otp:fail (< MAX_OTP_ATTEMPTS)] -> issue another OTP round
 *   [password:pass, otp:fail (>= MAX_OTP_ATTEMPTS)] -> fail
 */
module.exports.handler = async (event) => {
    const session = event.request.session || []

    if (session.length === 0) {
        event.response.issueTokens = false
        event.response.failAuthentication = false
        event.response.challengeName = 'CUSTOM_CHALLENGE'
        return event
    }

    const password_round = session.find((entry) => entry.challengeMetadata === 'PASSWORD_VERIFIER')
    if (!password_round || !password_round.challengeResult) {
        event.response.issueTokens = false
        event.response.failAuthentication = true
        return event
    }

    const otp_rounds = session.filter((entry) => entry.challengeMetadata === 'OTP')
    const last_otp_round = otp_rounds[otp_rounds.length - 1]

    if (last_otp_round && last_otp_round.challengeResult) {
        event.response.issueTokens = true
        event.response.failAuthentication = false
        return event
    }

    if (otp_rounds.length >= MAX_OTP_ATTEMPTS) {
        event.response.issueTokens = false
        event.response.failAuthentication = true
        return event
    }

    event.response.issueTokens = false
    event.response.failAuthentication = false
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    return event
}

module.exports.MAX_OTP_ATTEMPTS = MAX_OTP_ATTEMPTS
