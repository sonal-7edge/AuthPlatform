import { useDispatch, useSelector } from 'react-redux'
import { SignOutAction, FetchTokensAction, RefreshTokenAction, setScreen } from '../Auth/AuthSlice'
import { AUTH_SCREENS } from '../../constants/authConstants'

export default function Dashboard() {
  const dispatch = useDispatch()
  const { user, idToken, refreshToken, isLoading } = useSelector((state) => state.authStore)

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.name || user?.email || 'User'

  async function handleFetchTokens() {
    const result = await dispatch(FetchTokensAction())
    if (FetchTokensAction.fulfilled.match(result)) {
      alert(`Tokens fetched!\nID Token: ${result.payload.idToken?.slice(0, 50)}…`)
    } else {
      alert(`Error: ${result.payload}`)
    }
  }

  async function handleRefreshToken() {
    const result = await dispatch(RefreshTokenAction())
    if (RefreshTokenAction.fulfilled.match(result)) {
      alert(`Token refreshed!\nNew ID Token: ${result.payload.idToken?.slice(0, 50)}…`)
    } else {
      alert(`Error: ${result.payload}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome, {displayName}</h1>
        <p className="text-sm text-gray-500 mb-6">{user?.email || user?.phone || ''}</p>

        <div className="space-y-3 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">ID Token</p>
            <code className="text-xs text-gray-700 break-all font-mono">
              {idToken ? `${idToken.slice(0, 70)}…` : '—'}
            </code>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Refresh Token</p>
            <code className="text-xs text-gray-700 break-all font-mono">
              {refreshToken ? `${refreshToken.slice(0, 70)}…` : '—'}
            </code>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap mb-3">
          <button
            onClick={handleFetchTokens}
            disabled={isLoading}
            className="flex-1 min-w-[130px] py-2.5 px-4 rounded-lg border border-gray-300 bg-gray-50
              text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Fetch Tokens
          </button>
          <button
            onClick={handleRefreshToken}
            disabled={isLoading}
            className="flex-1 min-w-[130px] py-2.5 px-4 rounded-lg border border-gray-300 bg-gray-50
              text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Refresh Token
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => dispatch(setScreen(AUTH_SCREENS.CHANGE_PASSWORD))}
            disabled={isLoading}
            className="flex-1 min-w-[130px] py-2.5 px-4 rounded-lg border border-primary/30 bg-primary/5
              text-sm font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            Change Password
          </button>
          <button
            onClick={() => dispatch(setScreen(AUTH_SCREENS.DELETE_ACCOUNT))}
            disabled={isLoading}
            className="flex-1 min-w-[130px] py-2.5 px-4 rounded-lg border border-red-200 bg-red-50
              text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Delete Account
          </button>
          <button
            onClick={() => dispatch(SignOutAction())}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-lg border border-gray-300 bg-gray-50
              text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
