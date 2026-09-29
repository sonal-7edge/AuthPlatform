const crypto = require('crypto')
const {
    CognitoIdentityProviderClient,
    SignUpCommand,
    ConfirmSignUpCommand,
    ResendConfirmationCodeCommand,
    AdminInitiateAuthCommand,
    AdminUserGlobalSignOutCommand,
    AdminGetUserCommand,
    AdminConfirmSignUpCommand,
    AdminSetUserPasswordCommand,
    AdminDeleteUserCommand,
    ForgotPasswordCommand,
    ConfirmForgotPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider')

const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
})

/**
 * Thin wrapper around the Cognito Identity Provider SDK, mirroring the
 * CognitoHelper class convention used elsewhere in this org so the calling
 * pattern is familiar across repos.
 *
 * Verification codes are Cognito's own: SignUp triggers the email, and
 * ConfirmSignUp spends the code. Nothing here composes or delivers a
 * message, which is why the service needs no SES or SNS access.
 */
class Cognito {
    constructor({
        user_pool_id = process.env.COGNITO_USER_POOL_ID,
        client_id = process.env.COGNITO_CLIENT_ID,
        client_secret = process.env.COGNITO_CLIENT_SECRET,
    } = {}) {
        this.user_pool_id = user_pool_id
        this.client_id = client_id
        this.client_secret = client_secret
    }

    /**
     * Cognito requires a SECRET_HASH on every call when the app client has a
     * client secret configured. No-op (undefined) when it doesn't.
     */
    secretHash(username) {
        if (!this.client_secret) {
            return undefined
        }
        return crypto
            .createHmac('sha256', this.client_secret)
            .update(username + this.client_id)
            .digest('base64')
    }

    /**
     * Creates the user in an UNCONFIRMED state. Cognito emails (or texts) the
     * confirmation code itself, using whatever the user pool's own message
     * configuration is — the pool needs the matching attribute listed under
     * AutoVerifiedAttributes or no code is sent.
     */
    async signUp({ username, password, user_attributes = [] }) {
        const command = new SignUpCommand({
            ClientId: this.client_id,
            Username: username,
            Password: password,
            SecretHash: this.secretHash(username),
            UserAttributes: user_attributes,
        })
        return cognitoClient.send(command)
    }

    /** Spends the code Cognito sent, moving the user to CONFIRMED. */
    async confirmSignUp({ username, code }) {
        const command = new ConfirmSignUpCommand({
            ClientId: this.client_id,
            Username: username,
            ConfirmationCode: code,
            SecretHash: this.secretHash(username),
        })
        return cognitoClient.send(command)
    }

    /** Re-sends the sign-up confirmation code to the same destination. */
    async resendConfirmationCode(username) {
        const command = new ResendConfirmationCodeCommand({
            ClientId: this.client_id,
            Username: username,
            SecretHash: this.secretHash(username),
        })
        return cognitoClient.send(command)
    }

    /**
     * Username + password sign-in, server-side. Returns Cognito's
     * AuthenticationResult (id / access / refresh tokens) directly.
     *
     * Uses the admin flow so the password never has to be verified through a
     * client-side SRP exchange; the app client must allow
     * ALLOW_ADMIN_USER_PASSWORD_AUTH.
     */
    async signIn({ username, password }) {
        const command = new AdminInitiateAuthCommand({
            AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
            UserPoolId: this.user_pool_id,
            ClientId: this.client_id,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
                SECRET_HASH: this.secretHash(username),
            },
        })
        return cognitoClient.send(command)
    }

    /**
     * Proves the caller knows `password`, without issuing a session.
     *
     * change_password.js and delete_account.js need this because the client
     * only ever holds an idToken, never an accessToken, so Cognito's own
     * ChangePassword / DeleteUser APIs are unusable here. Running the same
     * password check sign-in uses means a stolen idToken alone is not enough
     * to change a password or delete an account.
     *
     * Throws NotAuthorizedException on a wrong password, which
     * handler_wrapper.js maps to 401. The tokens it mints are discarded.
     */
    async adminVerifyPassword({ username, password }) {
        await this.signIn({ username, password })
    }

    async adminGetUser(username) {
        const command = new AdminGetUserCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
        })
        return cognitoClient.send(command)
    }

    /**
     * @param {string} refresh_token
     * @param {string} [username] - only required if the app client has a
     * client secret configured (needed to compute SECRET_HASH); the
     * refresh-token payload alone does not carry the username.
     */
    async refreshTokens(refresh_token, username) {
        const auth_parameters = { REFRESH_TOKEN: refresh_token }
        if (username) {
            auth_parameters.SECRET_HASH = this.secretHash(username)
        }
        const command = new AdminInitiateAuthCommand({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            UserPoolId: this.user_pool_id,
            ClientId: this.client_id,
            AuthParameters: auth_parameters,
        })
        return cognitoClient.send(command)
    }

    async globalSignOut(username) {
        const command = new AdminUserGlobalSignOutCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
        })
        return cognitoClient.send(command)
    }

    /**
     * Kicks off Cognito's native ForgotPassword flow — sends a confirmation
     * code via whatever delivery medium the pool has configured for this
     * user. Unlike sign-in/sign-up, there's no password to verify first here,
     * so this is the one flow that uses Cognito's own code delivery instead
     * of the custom-auth OTP chain.
     */
    async forgotPassword(username) {
        const command = new ForgotPasswordCommand({
            ClientId: this.client_id,
            Username: username,
            SecretHash: this.secretHash(username),
        })
        return cognitoClient.send(command)
    }

    async confirmForgotPassword({ username, confirmation_code, password }) {
        const command = new ConfirmForgotPasswordCommand({
            ClientId: this.client_id,
            Username: username,
            ConfirmationCode: confirmation_code,
            Password: password,
            SecretHash: this.secretHash(username),
        })
        return cognitoClient.send(command)
    }

    /**
     * Admin-side password set, bypassing the confirmation-code requirement —
     * used by reset_password.js (once the code was already spent by
     * confirmForgotPassword) and change_password.js (currentPassword already
     * verified via adminVerifyPassword).
     */
    async adminSetUserPassword({ username, password, permanent = true }) {
        const command = new AdminSetUserPasswordCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
            Password: password,
            Permanent: permanent,
        })
        return cognitoClient.send(command)
    }

    async adminDeleteUser(username) {
        const command = new AdminDeleteUserCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
        })
        return cognitoClient.send(command)
    }
}

module.exports = Cognito
