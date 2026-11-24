import type { ApiError } from '../types/contract';
export const isMock = import.meta.env.VITE_API_MODE !== 'live';
export async function request<T>(
  path: string,
  options: RequestInit = {},
  language = 'ko',
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', language);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase()))
    headers.set('X-Requested-With', 'market-on');
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
    if (response.status === 401) window.dispatchEvent(new Event('auth:unauthorized'));
    if (response.status === 204) return undefined as T;
    const body = await response.json();
    if (!response.ok)
      throw body.error ?? { code: `HTTP_${response.status}`, message: '요청에 실패했어요.' };
    return body as T;
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e) throw e;
    throw { code: 'NETWORK_ERROR', message: '연결을 확인해 주세요.' } satisfies ApiError;
  }
}
export const query = (values: object) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
