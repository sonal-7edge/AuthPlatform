import { createContext, useEffect, useMemo, useState } from 'react'
import { createAuthClient } from '../core/createAuthClient'
import { applyTheme } from '../ui/theme'

export const AuthContext = createContext(null)

/**
 * Wires a single auth client instance into React context. Pass a pre-built
 * `client` (e.g. one shared with non-React code), or a `config` object to have
 * one created for you. Either is read only on first render — the instance is
 * stable for the lifetime of the provider.
 *
 * `theme` is an optional token override applied as CSS custom properties on
 * the document root, so the prebuilt screens can be rebranded without
 * rebuilding the package.
 *
 * @param {{
 *   client?: object,
 *   config?: object,
 *   theme?: object,
 *   children: React.ReactNode,
 * }} props
 */
export function AuthProvider({ client, config, theme, children }) {
  const [authClient] = useState(() => client ?? createAuthClient(config))

  // Cross-tab listeners are attached for as long as the provider is mounted.
  // connect/disconnect are symmetric and repeatable, which is what makes this
  // survive StrictMode's mount -> cleanup -> remount cycle; calling destroy()
  // here instead would kill the channel on the very first simulated unmount.
  useEffect(() => {
    authClient.connect?.()
    return () => authClient.disconnect?.()
  }, [authClient])

  // Serialise so a fresh-but-equal object literal doesn't re-apply every render.
  const themeKey = useMemo(() => JSON.stringify(theme ?? null), [theme])
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [themeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContext.Provider value={authClient}>{children}</AuthContext.Provider>
}
