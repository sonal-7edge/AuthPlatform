const { CognitoJwtVerifier } = require('aws-jwt-verify')

let verifier

function getVerifier() {
    if (!verifier) {
        verifier = CognitoJwtVerifier.create({
            userPoolId: process.env.COGNITO_USER_POOL_ID,
            tokenUse: 'id',
            clientId: process.env.COGNITO_CLIENT_ID,
        })
    }
    return verifier
}

/**
 * Verifies the Bearer idToken attached to authenticated requests (logout,
 * change-password, delete-account) and returns the decoded claims.
 * Throws if the token is missing, expired, or fails signature verification.
 */
async function verifyIdToken(auth_header) {
    if (!auth_header || !auth_header.startsWith('Bearer ')) {
        throw new Error('Missing bearer token')
    }
    const token = auth_header.slice('Bearer '.length)
    return getVerifier().verify(token)
}

module.exports = { verifyIdToken }
