const crypto = require('crypto')
const {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
    RespondToAuthChallengeCommand,
    AdminInitiateAuthCommand,
    AdminRespondToAuthChallengeCommand,
    AdminUserGlobalSignOutCommand,
    AdminGetUserCommand,
    AdminConfirmSignUpCommand,
    AdminSetUserPasswordCommand,
    AdminDeleteUserCommand,
    ForgotPasswordCommand,
    ConfirmForgotPasswordCommand,
    SignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider')

const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
})

/**
 * Thin wrapper around the Cognito Identity Provider SDK, mirroring the
 * CognitoHelper class convention used elsewhere in this org so the calling
 * pattern is familiar across repos.
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

    async adminConfirmSignUp(username) {
        const command = new AdminConfirmSignUpCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
        })
        return cognitoClient.send(command)
    }

    async adminGetUser(username) {
        const command = new AdminGetUserCommand({
            UserPoolId: this.user_pool_id,
            Username: username,
        })
        return cognitoClient.send(command)
    }

    /**
     * Kicks off (or continues) the CUSTOM_AUTH challenge chain as the app
     * client (not admin) — used to start Sign In / Sign Up OTP flows.
     */
    async initiateCustomAuth(username) {
        const command = new InitiateAuthCommand({
            AuthFlow: 'CUSTOM_AUTH',
            ClientId: this.client_id,
            AuthParameters: {
                USERNAME: username,
                SECRET_HASH: this.secretHash(username),
            },
        })
        return cognitoClient.send(command)
    }

    async respondToAuthChallenge({ username, session, challenge_name, answer }) {
        const command = new RespondToAuthChallengeCommand({
            ClientId: this.client_id,
            ChallengeName: challenge_name,
            Session: session,
            ChallengeResponses: {
                USERNAME: username,
                ANSWER: answer,
                SECRET_HASH: this.secretHash(username),
            },
        })
        return cognitoClient.send(command)
    }

    /**
     * Admin-side password verification, used inside the
     * VerifyAuthChallengeResponse trigger to validate round 1 of the
     * custom-auth chain.
     */
    async adminVerifyPassword({ username, password }) {
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

    async adminRespondToAuthChallenge({ username, session, challenge_name, answer }) {
        const command = new AdminRespondToAuthChallengeCommand({
            UserPoolId: this.user_pool_id,
            ClientId: this.client_id,
            ChallengeName: challenge_name,
            Session: session,
            ChallengeResponses: {
                USERNAME: username,
                ANSWER: answer,
                SECRET_HASH: this.secretHash(username),
            },
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
