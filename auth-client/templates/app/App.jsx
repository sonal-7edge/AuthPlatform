import { useEffect, useState } from 'react'
import {
  AuthProvider, useAuth, AuthFlow, ChangePassword, DeleteAccount,
  authConfig, decodeJWT, API_BASE_URL,
} from './auth'
import './auth/home.css'

/**
 * Live session panel: what the library is holding and how long it is good for.
 *
 * Handy while you are wiring things up — the countdown shows the proactive
 * refresh firing inside the 30s skew, and "Force refresh" triggers it on
 * demand. Delete this component once you trust it; nothing else depends on it.
 */
function Session() {
  const { idToken, accessToken, getRefreshToken, refreshToken, expiresIn } = useAuth()
  const [left, setLeft] = useState(() => expiresIn())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setLeft(expiresIn()), 1000)
    return () => clearInterval(timer)
  }, [expiresIn])

  const claims = idToken ? decodeJWT(idToken) : null
  const short = (token) => (token ? `${token.slice(0, 18)}…${token.slice(-8)}` : 'null')

  async function forceRefresh() {
    setRefreshing(true)
    await refreshToken()
    setLeft(expiresIn())
    setRefreshing(false)
  }

  return (
    <section className="card">
      <h2>Session</h2>

      <div className={`ttl ${left <= 30 ? 'warn' : ''}`} data-testid="expiry">
        <strong>{Math.max(0, Math.round(left))}s</strong> until the idToken expires
        {left <= 30 && ' — inside the 30s refresh skew'}
      </div>

      <dl>
        <dt>idToken</dt><dd data-testid="idToken">{short(idToken)}</dd>
        <dt>accessToken</dt><dd data-testid="accessToken">{short(accessToken)}</dd>
        <dt>refreshToken</dt><dd data-testid="refreshToken">{short(getRefreshToken())}</dd>
        <dt>subject</dt><dd>{claims?.sub ?? '—'}</dd>
        <dt>token_use</dt><dd>{claims?.token_use ?? '—'}</dd>
        <dt>expires at</dt>
        <dd>{claims?.exp ? new Date(claims.exp * 1000).toLocaleTimeString() : '—'}</dd>
      </dl>

      <div className="row">
        <button data-testid="force-refresh" disabled={refreshing} onClick={forceRefresh}>
          {refreshing ? 'Refreshing…' : 'Force refresh'}
        </button>
      </div>
    </section>
  )
}

/**
 * Everything below is YOUR app. The library owns the pre-auth screens; what a
 * signed-in user sees is entirely up to you. ChangePassword and DeleteAccount
 * are plain components — drop them into your own routes however you like.
 */
function Home() {
  const { user, logout, isLoading } = useAuth()
  const [view, setView] = useState('home')

  if (view === 'change-password') {
    return <ChangePassword onSuccess={() => setView('home')} onCancel={() => setView('home')} />
  }
  if (view === 'delete-account') {
    return <DeleteAccount onDeleted={() => setView('home')} onCancel={() => setView('home')} />
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>Signed in as {user?.email || user?.phone}</h1>
          <p className="api" data-testid="api">{API_BASE_URL}</p>
        </div>
        <button className="ghost" onClick={logout} disabled={isLoading}>Log out</button>
      </header>

      <Session />

      <section className="card">
        <h2>Account</h2>
        <dl>
          <dt>Name</dt><dd>{user?.name ?? '—'}</dd>
          <dt>Email</dt><dd>{user?.email ?? '—'}</dd>
          <dt>User ID</dt><dd>{user?.id ?? '—'}</dd>
        </dl>
        <div className="row">
          <button onClick={() => setView('change-password')}>Change password</button>
          <button className="danger" onClick={() => setView('delete-account')}>Delete account</button>
        </div>
      </section>
    </div>
  )
}

/**
 * Split out from App so it can call useAuth() — a component cannot read a
 * context that it renders itself.
 */
function Root() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Home /> : <AuthFlow />
}

export default function App() {
  return (
    <AuthProvider config={authConfig}>
      <Root />
    </AuthProvider>
  )
}
