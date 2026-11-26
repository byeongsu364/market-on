import { describe, expect, it, vi } from 'vitest';
import { ask as mockAsk } from '../api/mock';

vi.mock('../api/client', () => ({ isMock: false, request: vi.fn() }));
import { ask } from '../api/ask';
import { request } from '../api/client';

describe('ask contract', () => {
  it('posts through the shared client', async () => {
    const data = { intent: 'store' as const, item_id: 'item:green_onion' };
    await ask(data);
    expect(request).toHaveBeenCalledWith('/ask', { method: 'POST', body: JSON.stringify(data) });
  });
  it('provides evidence, price and item selection mocks', async () => {
    const answer = await mockAsk({ question: '대파 보관 방법', intent: 'store' });
    expect(answer.kind).toBe('answer');
    expect(answer.citations).toHaveLength(1);
    const price = await mockAsk({ item_id: 'item:apple', intent: 'price' });
    expect(price.kind).toBe('price');
    expect(price.price?.reference_price).toBeGreaterThan(0);
    const missing = await mockAsk({ intent: 'store' });
    expect(missing.kind).toBe('need_item');
    expect(missing.candidates?.length).toBeLessThanOrEqual(5);
  });
});
