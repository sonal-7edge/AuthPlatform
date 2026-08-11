const { response } = require('../lib/helpers')

/**
 * POST /auth/tokens — { email } -> 501
 *
 * Deliberately unimplemented. The auth-client contract calls this with only
 * an email — no password, OTP, or refresh token — which would let anyone
 * mint tokens for any user by knowing their email. It's currently dead code
 * on the client (no UI screen calls it). Flagging as a contract gap for the
 * auth-client owner to revisit rather than building an insecure endpoint.
 */
module.exports.handler = async () => response(501, {
    message: 'Not implemented — /auth/tokens as specified (identify-by-email only) is not a safe way to issue tokens. See auth/README.md.',
})
