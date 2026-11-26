import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { it, expect, vi } from 'vitest';

it('서비스 워커는 푸시를 표시하고 클릭 시 다른 출처를 차단한다', async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://market.test' },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        listeners[name] = handler;
      },
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
    },
  });
  let work: Promise<unknown> = Promise.resolve();
  const waitUntil = (promise: Promise<unknown>) => {
    work = promise;
  };
  listeners.push({
    data: { json: () => ({ title: '세일', body: '대파', url: '//evil.example/path' }) },
    waitUntil,
  });
  await work;
  expect(showNotification).toHaveBeenCalledWith(
    '세일',
    expect.objectContaining({ data: { url: 'https://market.test/me/notifications' } }),
  );
  const close = vi.fn();
  listeners.notificationclick({
    notification: { close, data: { url: 'https://evil.example/' } },
    waitUntil,
  });
  await work;
  expect(close).toHaveBeenCalled();
  expect(openWindow).toHaveBeenCalledWith('https://market.test/me/notifications');
  listeners.notificationclick({
    notification: { close, data: { url: '/s/store%3Aa' } },
    waitUntil,
  });
  await work;
  expect(openWindow).toHaveBeenLastCalledWith('https://market.test/s/store%3Aa');
});
