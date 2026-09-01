/**
 * Normalises an axios error into the standard client response shape, so every
 * method resolves with `{ error, ... }` instead of throwing. Callers branch on
 * `result.error`; no try/catch required.
 *
 * @param {import('axios').AxiosError} error
 * @returns {{ error: true, message: string, status?: number, code?: string }}
 */
export function handleErrorResponse(error) {
  if (error.response) {
    const body = error.response.data
    return {
      error: true,
      message: body?.message || body?.error || `Request failed with status ${error.response.status}`,
      status: error.response.status,
      code: body?.code,
    }
  }

  if (error.request) {
    return {
      error: true,
      message: 'Could not reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
    }
  }

  return { error: true, message: error.message || 'Something went wrong', code: 'UNKNOWN' }
}
