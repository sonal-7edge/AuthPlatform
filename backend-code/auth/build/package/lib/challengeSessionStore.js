/**
 * Pending Cognito CUSTOM_AUTH "Session" strings, keyed by identifier
 * (email/phone), between the moment Sign Up/Sign In kicks off the OTP round
 * and the moment Verify OTP completes it.
 *
 * In-memory by default — fine for a single Lambda container/dev use, but a
 * cold start or a second concurrent container won't see another's entries.
 * Swap in a shared store (DynamoDB, Redis/ElastiCache) for production
 * multi-instance deployments by implementing the same {get, set, delete}
 * shape and passing it to createChallengeSessionStore().
 */
function createInMemoryStore() {
    const store = new Map()

    return {
        get(key) {
            const entry = store.get(key)
            if (!entry) {
                return undefined
            }
            if (entry.expires_at < Date.now()) {
                store.delete(key)
                return undefined
            }
            return entry.value
        },
        set(key, value, ttl_seconds) {
            store.set(key, { value, expires_at: Date.now() + ttl_seconds * 1000 })
        },
        delete(key) {
            store.delete(key)
        },
    }
}

let default_store

function getChallengeSessionStore() {
    if (!default_store) {
        default_store = createInMemoryStore()
    }
    return default_store
}

module.exports = { createInMemoryStore, getChallengeSessionStore }
