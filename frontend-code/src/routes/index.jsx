import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { setupAxiosInterceptors } from '../helpers/axiosInterceptor'
import { useAuth } from '../customHooks/useAuth'
import Auth from '../pages/Auth'
import Dashboard from '../pages/Dashboard'
import ChangePassword from '../pages/Auth/ChangePassword'
import DeleteAccount from '../pages/Auth/DeleteAccount'
import { AUTH_SCREENS } from '../constants/authConstants'

export default function Routes() {
  const { signOut } = useAuth()
  const { isAuthenticated, screen } = useSelector((state) => state.authStore)

  useEffect(() => {
    setupAxiosInterceptors(signOut)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isAuthenticated) {
    if (screen === AUTH_SCREENS.CHANGE_PASSWORD) return <ChangePassword />
    if (screen === AUTH_SCREENS.DELETE_ACCOUNT) return <DeleteAccount />
    return <Dashboard />
  }

  return <Auth />
}
