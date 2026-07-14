import { useState } from 'react'
import { AuthProvider, useAuth } from 'auth-client/react'
import { AuthFlow, ChangePassword, DeleteAccount } from 'auth-client/ui'
import 'auth-client/ui/style.css'

function AuthedArea() {
  const { user, logout } = useAuth()
  const [view, setView] = useState('dashboard')

  if (view === 'change-password') {
    return (
      <ChangePassword
        onSuccess={() => setView('dashboard')}
        onCancel={() => setView('dashboard')}
      />
    )
  }

  if (view === 'delete-account') {
    return (
      <DeleteAccount
        onDeleted={() => setView('dashboard')}
        onCancel={() => setView('dashboard')}
      />
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome, {user?.name}</h1>
        <p className="text-sm text-gray-500 mb-6">{user?.email}</p>
        <div className="flex flex-col gap-3">
          <button
            className="w-full h-11 rounded-lg font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90"
            onClick={() => setView('change-password')}
          >
            Change password
          </button>
          <button
            className="w-full h-11 rounded-lg font-semibold text-white bg-red-600 hover:opacity-90"
            onClick={() => setView('delete-account')}
          >
            Delete account
          </button>
          <button
            className="w-full h-11 rounded-lg font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function Root() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <AuthedArea /> : <AuthFlow />
}

export default function App() {
  return (
    <AuthProvider config={{ useMock: true }}>
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 text-xs bg-black/80 text-white px-3 py-1.5 rounded-full">
        mock mode — any email/password works, OTP is <strong>123456</strong>
      </div>
      <Root />
    </AuthProvider>
  )
}
