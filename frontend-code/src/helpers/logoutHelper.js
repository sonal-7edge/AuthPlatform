import { tokenManager } from './tokenManager'
import { resetAuth } from '../pages/Auth/AuthSlice'

/**
 * Clears persisted tokens and resets Redux auth state.
 * @param {import('@reduxjs/toolkit').Dispatch} dispatch
 */
export function handleLogout(dispatch) {
  tokenManager.clear()
  dispatch(resetAuth())
}
