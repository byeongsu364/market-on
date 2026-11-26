// 품목 그림(public/items). 품목 id와 사과 품종 id로 고름. 그림이 없는 품목은 null(연한 면만 둠).
const items: Record<string, string> = {
  'item:apple': 'apple',
  'item:pear': 'pear',
  'item:sweet_persimmon': 'persimmon',
  'item:green_onion': 'green-onion',
  'item:onion': 'onion',
};
const varieties: Record<string, string> = {
  'variety:apple-fuji': 'apple',
  'variety:apple-hongro': 'apple-hongro',
  'variety:apple-shinano-gold': 'apple-shinano-gold',
};
export function itemImage(itemId?: string | null, varietyId?: string | null): string | null {
  const name = (varietyId && varieties[varietyId]) || (itemId && items[itemId]);
  return name ? `/items/${name}.svg` : null;
}
