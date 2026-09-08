const { badRequest, unauthorized, notFound, serverError } = require('./helpers')

/**
 * Maps known Cognito error names to the HTTP response the frontend contract
 * expects ({message} body + matching status). Anything unrecognised falls
 * through to a generic 500 so we never leak internal error details.
 */
const COGNITO_ERROR_RESPONSES = {
    NotAuthorizedException: () => unauthorized('Incorrect credentials or verification code'),
    UserNotFoundException: () => notFound('User not found'),
    UsernameExistsException: () => badRequest('An account with that email/phone already exists'),
    CodeMismatchException: () => badRequest('Incorrect verification code'),
    ExpiredCodeException: () => badRequest('Verification code has expired'),
    InvalidPasswordException: (error) => badRequest(error.message || 'Password does not meet the required policy'),
    LimitExceededException: () => badRequest('Too many attempts, please try again later'),
    TooManyRequestsException: () => badRequest('Too many attempts, please try again later'),
    TooManyFailedAttemptsException: () => badRequest('Too many attempts, please try again later'),
    UserNotConfirmedException: () => badRequest('Account is not confirmed'),
}

/**
 * Wraps a Lambda handler with consistent JSON-body parsing failures aside,
 * try/catch, and Cognito-error-to-HTTP-response mapping, so individual
 * handlers only need to express their own logic.
 */
function withErrorHandling(handler) {
    return async (event, context) => {
        try {
            return await handler(event, context)
        } catch (error) {
            console.error(error)
            const map_to_response = COGNITO_ERROR_RESPONSES[error?.name]
            if (map_to_response) {
                return map_to_response(error)
            }
            // Every aws-jwt-verify failure is a bad token, not a bad server:
            // expiry, signature, issuer/audience/claim mismatch, unparseable,
            // unknown kid. They all have to answer 401 — the frontend's http
            // interceptor keys its refresh-and-retry off that status, and a
            // 500 would strand the caller on a token it could have renewed.
            if (error?.message === 'Missing bearer token' || /^(Jwt|Jwk|Kid)/.test(error?.name || '')) {
                return unauthorized()
            }
            return serverError()
        }
    }
}

module.exports = { withErrorHandling }
