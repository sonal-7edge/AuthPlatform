import { createContext, useState } from 'react'
import { createAuthClient } from '../core/createAuthClient'

export const AuthContext = createContext(null)

/**
 * Wires a single auth client instance into React context. Pass a
 * pre-built `client` (e.g. shared with non-React code), or a `config`
 * object to have one created for you. Either is only read on first render —
 * the client instance is stable for the lifetime of the provider.
 */
export function AuthProvider({ client, config, children }) {
  const [authClient] = useState(() => client ?? createAuthClient(config))
  return <AuthContext.Provider value={authClient}>{children}</AuthContext.Provider>
}
