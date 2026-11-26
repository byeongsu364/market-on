import { expect, it } from 'vitest';
import { getItem, getInSeason, price, search } from '../api/mock';
import { itemImage } from '../utils/itemImage';

it('connects mandarin aliases, criteria, varieties, sample prices and December', async () => {
  const item = await getItem('item:mandarin');
  expect(item.criteria).toHaveLength(4);
  expect(item.vision_labels).toEqual([]);
  expect((await search('밀감'))[0].item_id).toBe(item.item_id);
  expect((await search('하우스감귤'))[0].variety_id).toBe('variety:mandarin-greenhouse');
  expect(await getInSeason(12)).toEqual([
    { item_id: item.item_id, name: '귤', label: '12월 식재료' },
  ]);
  const result = await price({ item_id: item.item_id, market_id: 'market:demo', unit: 'each' });
  expect(result.variety_id).toBe('variety:mandarin-open');
  expect(result.varieties).toHaveLength(2);
  for (const variety of result.varieties) {
    expect(variety.harvest).toBeNull();
    expect(variety.description).toBeNull();
    expect(variety.reference_price).toBeGreaterThan(0);
    expect(itemImage(null, variety.variety_id)).toBe('/items/mandarin.svg');
  }
  expect(itemImage(item.item_id)).toBe('/items/mandarin.svg');
});
