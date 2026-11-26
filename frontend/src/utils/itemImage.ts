// 품목 그림(public/items). 품목 id와 사과 품종 id로 고름. 그림이 없는 품목은 null(연한 면만 둠).
const items: Record<string, string> = {
  'item:mandarin': 'mandarin',
  'item:apple': 'apple',
  'item:pear': 'pear',
  'item:sweet_persimmon': 'persimmon',
  'item:green_onion': 'green-onion',
  'item:onion': 'onion',
};
const varieties: Record<string, string> = {
  'variety:mandarin-open': 'mandarin',
  'variety:mandarin-greenhouse': 'mandarin',
  'variety:apple-fuji': 'apple',
  'variety:apple-hongro': 'apple-hongro',
  'variety:apple-shinano-gold': 'apple-shinano-gold',
};
export function itemImage(itemId?: string | null, varietyId?: string | null): string | null {
  const name = (varietyId && varieties[varietyId]) || (itemId && items[itemId]);
  return name ? `/items/${name}.svg` : null;
}

/** 품목 그림 판의 연한 바탕색(시안 Search·Store의 품목별 면). tokens.css의 --tint-* 변수, 없으면 회색 면 */
export function itemTint(itemId?: string | null, varietyId?: string | null): string {
  const name = (varietyId && varieties[varietyId]) || (itemId && items[itemId]);
  return name ? `var(--tint-${name}, var(--color-surface-strong))` : 'var(--color-surface-strong)';
}
