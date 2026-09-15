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
            if (error?.message === 'Missing bearer token' || error?.name === 'JwtExpiredError' || error?.name === 'JwtInvalidSignatureError') {
                return unauthorized()
            }
            return serverError()
        }
    }
}

module.exports = { withErrorHandling }
