import { tokenManager } from './tokenManager'

/**
 * Returns axios-compatible headers object with JWT Authorization header.
 * Reads the current idToken from localStorage via tokenManager.
 * @returns {{ headers: Record<string, string> }}
 */
export function authHeader() {
  const idToken = tokenManager.getIdToken()
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(idToken && { Authorization: `Bearer ${idToken}` }),
    },
  }
}
