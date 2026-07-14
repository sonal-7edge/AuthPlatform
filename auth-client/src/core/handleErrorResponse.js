/**
 * Normalises axios errors into the standard client response shape.
 * @param {import('axios').AxiosError} error
 * @returns {{ error: true, message: string, status: number | undefined }}
 */
export function handleErrorResponse(error) {
  if (error.response) {
    return {
      error: true,
      message: error.response.data?.message || `Request failed: ${error.response.status}`,
      status: error.response.status,
    }
  }
  return { error: true, message: error.message || 'Network error', status: undefined }
}
