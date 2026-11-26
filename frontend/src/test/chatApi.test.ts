import { expect, it, vi } from 'vitest';
vi.mock('../api/client', () => ({ isMock: false, request: vi.fn() }));
import { chat } from '../api/chat';
import { request } from '../api/client';
it('공통 클라이언트로 대화·시장·품목을 보낸다', async () => {
  vi.mocked(request).mockResolvedValue({});
  const data = {
    messages: [{ role: 'user' as const, content: '대파 보관?' }],
    market_id: 'market:demo',
    item_id: 'item:green_onion',
  };
  await chat(data);
  expect(request).toHaveBeenCalledWith('/chat', { method: 'POST', body: JSON.stringify(data) });
});
