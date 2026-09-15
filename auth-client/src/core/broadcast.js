import { AUTH_CHANNEL, BROADCAST_EVENTS, BROADCAST_FALLBACK_KEYS } from './constants'

/**
 * Cross-tab auth coordination, mirroring the ORDO host app's contract
 * (`src/helpers/tokenManager.js`). Messages on the 'auth' BroadcastChannel:
 *
 *   { type: 'token_refreshed', tokens }  — sent after every successful refresh
 *   { type: 'logout' }                   — session ended, every tab should clear
 *   { type: 'login' }                    — a tab signed in; others can reload
 *   { type: 'need_refresh' }             — a tab hit a 401 and wants the owner
 *                                          of the refresh lock to renew
 *
 * Browsers without BroadcastChannel (older Safari, some embedded webviews)
 * fall back to `storage` events — writing a timestamp to a sentinel key fires
 * `storage` in *other* tabs only, which is exactly the semantics we want.
 *
 * open()/close() are symmetric and repeatable so a React effect can pair them
 * as mount/cleanup. That matters under StrictMode, which deliberately mounts,
 * cleans up, and remounts: a one-way `close()` would leave the channel dead
 * for the rest of the session.
 */
export function createBroadcaster({ channelName = AUTH_CHANNEL, enabled = true } = {}) {
  // Subscribers outlive the transport, so open/close can cycle beneath them.
  const listeners = new Set()

  let channel = null
  let storageListenerAttached = false

  function emit(message) {
    listeners.forEach((listener) => listener(message))
  }

  const KEY_TO_EVENT = {
    [BROADCAST_FALLBACK_KEYS.TOKEN_REFRESHED]: BROADCAST_EVENTS.TOKEN_REFRESHED,
    [BROADCAST_FALLBACK_KEYS.LOGOUT]: BROADCAST_EVENTS.LOGOUT,
    [BROADCAST_FALLBACK_KEYS.LOGIN]: BROADCAST_EVENTS.LOGIN,
  }

  function handleChannelMessage(event) {
    if (event.data?.type) emit(event.data)
  }

  function handleStorage(event) {
    // Only react to sentinel writes with a value — `localStorage.clear()`
    // fires storage events with newValue === null for every key.
    if (!event.key || event.newValue === null) return
    const type = KEY_TO_EVENT[event.key]
    // The fallback can't carry a payload across tabs; receivers re-read
    // storage themselves, so an empty message is enough.
    if (type) emit({ type, viaFallback: true })
  }

  /** Idempotent — safe to call on every mount. */
  function open() {
    if (!enabled) return

    if (!channel && typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(channelName)
        channel.addEventListener('message', handleChannelMessage)
      } catch {
        // Unavailable — storage events remain as the fallback.
        channel = null
      }
    }

    if (!storageListenerAttached && typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage)
      storageListenerAttached = true
    }
  }

  /** Detaches the transport but keeps subscribers, so open() can resume. */
  function close() {
    if (channel) {
      try {
        channel.removeEventListener('message', handleChannelMessage)
        channel.close()
      } catch {
        // Already closed.
      }
      channel = null
    }

    if (storageListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage)
      storageListenerAttached = false
    }
  }

  function writeFallbackSentinel(type) {
    if (typeof window === 'undefined' || !window.localStorage) return
    const key = Object.keys(KEY_TO_EVENT).find((k) => KEY_TO_EVENT[k] === type)
    if (!key) return
    try {
      window.localStorage.setItem(key, String(Date.now()))
    } catch {
      // Storage full or blocked (private mode) — broadcasting is best-effort.
    }
  }

  open()

  return {
    open,
    close,

    /** Sends to every *other* tab. Never throws — broadcasting is best-effort. */
    post(type, payload) {
      try {
        channel?.postMessage({ type, ...payload })
      } catch {
        // Channel closed mid-flight; the sentinel below still notifies.
      }
      writeFallbackSentinel(type)
    },

    /** @returns {() => void} unsubscribe */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Permanent teardown: close the transport and drop every subscriber. */
    destroy() {
      close()
      listeners.clear()
    },
  }
}
