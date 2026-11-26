import { describe, expect, it, vi } from 'vitest';
import { ask as mockAsk } from '../api/mock';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  isMock: false,
  request: vi.fn(),
}));
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

it('requests in-season through the shared client', async () => {
  const { getInSeason } = await import('../api/items');
  await getInSeason(11);
  expect(request).toHaveBeenCalledWith('/items/in-season?month=11');
});

it('season mock returns ontology sentences with no model and no invented variety harvest', async () => {
  const result = await mockAsk({ intent: 'season', item_id: 'item:sweet_persimmon' });
  expect(result.answer).toContain('단감을 11월 식재료로 소개해요.');
  expect(result.answer).toContain('부유는 10월 하순~11월 상순에 수확해요');
  expect(result.model).toBeNull();
  expect(result.citations).toHaveLength(1);
  expect(
    (await mockAsk({ intent: 'season', item_id: 'item:apple', question: '시나노골드 언제' })).kind,
  ).toBe('no_evidence');
});
