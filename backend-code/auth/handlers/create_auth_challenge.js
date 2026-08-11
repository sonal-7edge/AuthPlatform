const crypto = require('crypto')
const { createDefaultNotifier } = require('../lib/notifier')
const { generateOtp } = require('../lib/helpers')

function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex')
}

/**
 * Cognito CUSTOM_AUTH trigger — builds the challenge for whichever round
 * define_auth_challenge just requested.
 *   session=[] -> round 1 (password): no message sent, VerifyAuthChallengeResponse
 *                 checks the answer directly against Cognito via AdminInitiateAuth.
 *   session=[password] -> round 2 (OTP), and every retry of it: generate a
 *                 fresh code, send it via the notifier, store its hash.
 */
module.exports.handler = async (event, context, callback, deps = {}) => {
    const notifier = deps.notifier || createDefaultNotifier()
    const session = event.request.session || []

    if (session.length === 0) {
        event.response.publicChallengeParameters = { step: 'PASSWORD' }
        event.response.privateChallengeParameters = {}
        event.response.challengeMetadata = 'PASSWORD_VERIFIER'
        return event
    }

    const otp = generateOtp()
    const identifier_type = event.request.userAttributes?.phone_number ? 'phone' : 'email'
    const identifier = identifier_type === 'phone'
        ? event.request.userAttributes.phone_number
        : event.request.userAttributes.email

    await notifier.sendOtp({ identifier, identifier_type, otp })

    event.response.publicChallengeParameters = { step: 'OTP' }
    event.response.privateChallengeParameters = { otp_hash: hashOtp(otp) }
    event.response.challengeMetadata = 'OTP'
    return event
}
