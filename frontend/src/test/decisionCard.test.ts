import { expect, it } from 'vitest';
import { buildCardData, wrapText, type CardInput } from '../utils/decisionCard';
const input: CardInput = {
  item: {
    item_id: 'apple',
    name: '사과',
    synonyms: [],
    vision_labels: [],
    criteria: [
      { key: 'a', text: '표면을 확인해요', source: '농사로' },
      { key: 'b', text: '꼭지를 확인해요', source: '농사로' },
    ],
    default_unit: 'kg',
    units: ['kg'],
    labels_i18n: {},
  },
  market: { market_id: 'market:demo', name: '시연 시장' },
  checked: ['a'],
  value: '8800',
  quantity: 1,
  unit: 'kg',
  origin: 'https://example.com',
  now: new Date('2026-11-25T16:00:00Z'),
  price: {
    item_id: 'apple',
    variety_id: 'fuji',
    variety_name: '후지',
    varieties: [],
    unit: 'kg',
    reference_price: 10000,
    diff_pct: -12,
    region: '서울',
    observed_on: '2026-11-25',
    fallback: null,
    source: 'aT 기간별 소매가격',
  },
};
it('체크한 항목과 품종·가격·서울 날짜·출처·시장 링크를 담는다', () => {
  const data = buildCardData(input);
  expect(data.points).toEqual(['✓ 표면을 확인해요']);
  expect(data.count).toBe('2개 중 1개 확인');
  expect(data.title).toBe('사과 · 후지');
  expect(data.prices.join()).toContain('12% 낮아요');
  expect(data.sources.join()).toContain('2026-11-25 조사');
  expect(data.url).toBe('https://example.com/?market=market%3Ademo');
  expect(data.filename).toBe('market-on-사과-2026-11-26.png');
  expect(data.alt).not.toMatch(/살 만해요|신선해요|구매 추천|최저가|등급/);
});
it('미체크면 모든 포인트를 체크 없이 표시하고 사진 없는 직접 입력을 보존한다', () => {
  const data = buildCardData({ ...input, checked: [], value: '' });
  expect(data.points).toEqual(['표면을 확인해요', '꼭지를 확인해요']);
  expect(data.count).toBe('확인 포인트 2개');
  expect(data.photo).toBeUndefined();
  expect(data.prices).toEqual(['기준시세 10,000원 / 1kg']);
});
it('사진 File은 그대로 유지하고 선택 점포로 연결한다', () => {
  const photo = new File(['local'], 'photo.jpg');
  const data = buildCardData({
    ...input,
    photo,
    store: { store_id: 'store:1', name: '점포 A-01' },
  });
  expect(data.photo).toBe(photo);
  expect(data.url).toBe('https://example.com/s/store%3A1');
  expect(data.store).toBe('점포 A-01');
});
it('폭 측정으로 줄바꿈하고 최대 줄에서 말줄임한다', () => {
  expect(wrapText('가나다라마바', (s) => s.length, 3, 2)).toEqual(['가나다', '라마바']);
  expect(wrapText('가나다라마바사', (s) => s.length, 3, 2)).toEqual(['가나다', '라마…']);
  expect(wrapText('가\n나', (s) => s.length, 3, 2)).toEqual(['가', '나']);
  expect(wrapText('가', (s) => s.length, 3, 0)).toEqual([]);
});
