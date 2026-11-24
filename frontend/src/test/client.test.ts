import { it, expect, vi } from 'vitest';
import { request } from '../api/client';
it('상태 변경 요청에 쿠키와 CSRF 헤더를 보내고 204를 처리한다', async () => {
  const transport = vi.fn().mockResolvedValue({ status: 204, ok: true });
  vi.stubGlobal('fetch', transport);
  try {
    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    const options = transport.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('X-Requested-With')).toBe('market-on');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('401은 세션 해제 이벤트와 계약 오류를 전달한다', async () => {
  const clear = vi.fn();
  window.addEventListener('auth:unauthorized', clear);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: '로그인해 주세요.' } }),
    }),
  );
  try {
    await expect(request('/auth/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(clear).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('auth:unauthorized', clear);
    vi.unstubAllGlobals();
  }
});
