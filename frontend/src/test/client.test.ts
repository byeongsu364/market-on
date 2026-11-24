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

it('모든 요청은 같은 UUID 기기 헤더를 유지한다', async () => {
  const transport = vi.fn().mockResolvedValue({ status: 204, ok: true });
  vi.stubGlobal('fetch', transport);
  try {
    await request('/markets/nearby');
    await request('/recognize', { method: 'POST', body: new FormData() });
    const ids = transport.mock.calls.map((call) => new Headers(call[1].headers).get('X-Device-Id'));
    expect(ids[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(ids[1]).toBe(ids[0]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('저장소를 사용할 수 없어도 세션 동안 기기 ID를 유지한다', async () => {
  vi.resetModules();
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    const client = await import('../api/client');
    const first = client.getDeviceId();
    expect(client.getDeviceId()).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
