import { saleEnd } from '../utils/sale';
import { it, expect } from 'vitest';
import * as api from '../api/mock';
import type { Item, MarketMap, Price, RecognizeResponse } from '../types/contract';
it('mock 계약과 지정 시세·온톨로지 문장을 유지한다', async () => {
  const item: Item = await api.getItem('item:green_onion');
  expect(item.criteria.map((c) => c.text)).toEqual([
    '잎 끝이 마르지 않고 누런 잎이 없어요',
    '흰 줄기가 단단하고 윤기가 있어요',
    '뿌리 쪽에 수분이 남아 있어요',
  ]);
  expect(item.criteria.every((c) => c.source)).toBe(true);
  const price: Price = await api.price({
    item_id: item.item_id,
    market_id: 'market:demo',
    unit: 'kg',
  });
  expect(price.by_market_type).toEqual({
    traditional: { price: 2576, count: 15 },
    large_retail: { price: 2451, count: 34 },
  });
  expect(price.source).toContain('샘플');
  expect(price.observed_on).toBe('2026-11-20');
  const map: MarketMap = await api.map('market:demo', item.item_id);
  expect(map.zones).toHaveLength(6);
  expect(map.stores).toHaveLength(24);
  expect(map.stores.filter((s) => s.highlight)).toHaveLength(3);
  const recognized: RecognizeResponse = await api.recognize(new File(['x'], 'uncertain.jpg'));
  expect(recognized.candidates).toHaveLength(3);
  expect(recognized.candidates[0].confidence).toBeLessThan(0.8);
  expect((await api.search('파')).map((i) => i.name)).toContain('대파');
});
it('실패 옵션은 공통 오류를 돌려준다', async () => {
  window.history.replaceState({}, '', '/?fail=1');
  await expect(api.nearby()).rejects.toMatchObject({
    code: 'MOCK_FAILURE',
    message: expect.any(String),
  });
});
it('상인 수정과 마감세일이 지도에 반영된다', async () => {
  const merchant = await import('../api/mock/merchant');
  await merchant.login(merchant.demoCredentials());
  await merchant.updateStore({ item_ids: ['item:green_onion', 'item:onion'] });
  const sale = await merchant.createSale({
    item_id: 'item:onion',
    sale_price: 3000,
    ends_at: saleEnd(),
  });
  const map = await api.map('market:demo', 'item:onion');
  expect(map.stores[0].active_sale).toBeTruthy();
  expect(merchant.activeSales().some((s) => s.id === sale.id)).toBe(true);
  await merchant.endSale(sale.id);
  expect(merchant.activeSales().some((s) => s.id === sale.id)).toBe(false);
});
it('상인 가격 확인과 지도 가격의 계약 키를 유지한다', async () => {
  const merchant = await import('../api/mock/merchant');
  await merchant.login(merchant.demoCredentials());
  await merchant.confirmPrice({ item_id: 'item:green_onion', price: 1800 });
  const row = (await merchant.getPrices()).find((r) => r.item_id === 'item:green_onion')!;
  expect(Object.keys(row).sort()).toEqual([
    'customers',
    'item_id',
    'my_confirmation',
    'name',
    'unit',
  ]);
  expect(Object.keys(row.my_confirmation!).sort()).toEqual(['confirmed_at', 'price']);
  const map = await api.map('market:demo', row.item_id);
  expect(map.stores[0].price?.source).toBe('merchant');
  expect(Object.keys(map.stores[0].price!).sort()).toEqual([
    'latest_at',
    'merchant_confirmed',
    'price',
    'reporters',
    'source',
    'stale',
    'unit',
  ]);
  expect((await api.map('market:demo')).stores.every((s) => s.price === null)).toBe(true);
});
