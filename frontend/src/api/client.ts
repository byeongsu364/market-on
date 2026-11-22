export type ApiError = { code: string; message: string }
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function request<T>(path: string, options: RequestInit = {}, language = 'ko'): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  headers.set('Accept-Language', language)
  if (options.body != null) headers.set('Content-Type', 'application/json')
  try {
    const response = await fetch(`${baseURL}${path}`, { ...options, headers })
    const body: unknown = await response.json()
    if (!response.ok) {
      const error = (body as { error?: Partial<ApiError> } | null)?.error
      throw { code: error?.code || `HTTP_${response.status}`, message: error?.message || response.statusText }
    }
    return body as T
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) throw error
    throw { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : '요청에 실패했습니다.' } satisfies ApiError
  }
}
