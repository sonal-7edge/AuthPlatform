const { badRequest, unauthorized, notFound, serverError } = require('./helpers')

/**
 * Cognito raises NotAuthorizedException for several unrelated situations, so
 * a single message is either vague or actively wrong — it used to mention a
 * verification code even on a rejected password. Cognito's own message is the
 * only thing distinguishing them, hence the substring matching; an unknown
 * one falls back to a phrase true of every case.
 *
 * Codes typed by a user do not land here at all: those are
 * CodeMismatchException and ExpiredCodeException, mapped separately below.
 */
function notAuthorizedMessage(error) {
    const detail = error?.message || ''

    if (/refresh token/i.test(detail)) {
        return 'Session has expired, please sign in again'
    }
    if (/user is disabled/i.test(detail)) {
        return 'This account has been disabled'
    }
    if (/cannot be confirmed/i.test(detail)) {
        return 'Account is already verified — please sign in'
    }
    return 'Incorrect credentials'
}

/**
 * Maps known Cognito error names to the HTTP response the frontend contract
 * expects ({message} body + matching status). Anything unrecognised falls
 * through to a generic 500 so we never leak internal error details.
 */
const COGNITO_ERROR_RESPONSES = {
    NotAuthorizedException: (error) => unauthorized(notAuthorizedMessage(error)),
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
