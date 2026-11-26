import type { Store, StoreCategory } from '../types/contract';

// 카테고리 아이콘과 핀 색. category가 서버에서 오기 전까지 구역 이름으로 정함(지시서 030 6장).
export const CATEGORY_LABELS: Record<StoreCategory, string> = {
  produce: '채소·과일',
  dried: '건어물·젓갈',
  seafood: '수산',
  side: '반찬',
  meat: '정육',
  ricecake: '떡',
};
const byZone: [RegExp, StoreCategory][] = [
  [/채소|과일|청과/, 'produce'],
  [/건어물|젓갈/, 'dried'],
  [/수산/, 'seafood'],
  [/반찬/, 'side'],
  [/정육/, 'meat'],
  [/떡/, 'ricecake'],
];
export function categoryOfZone(zoneName: string | undefined): StoreCategory | null {
  if (!zoneName) return null;
  return byZone.find(([re]) => re.test(zoneName))?.[1] ?? null;
}
export function storeCategory(store: Pick<Store, 'category'>, zoneName?: string) {
  return store.category ?? categoryOfZone(zoneName);
}
export const categoryColor = (c: StoreCategory | null) =>
  c ? `var(--pin-${c})` : 'var(--pin-default)';
