import type { Item, Store } from '../../types/contract';
import { zones } from '../../constants/zones';
export const source = 'aT 기간별 소매가격 · 2026-11-20 조사 · 샘플';
const names = ['대파', '양파', '사과', '배', '단감'];
const ids = ['green_onion', 'onion', 'apple', 'pear', 'sweet_persimmon'];
export const items: Item[] = ids.map((id, i) => ({
  item_id: `item:${id}`,
  name: names[i],
  synonyms: i === 0 ? ['대파', '파'] : [names[i], id],
  vision_labels: i === 0 ? ['green onion', 'scallion'] : [id],
  criteria:
    i === 0
      ? [
          '잎 끝이 마르지 않고 누런 잎이 없어요',
          '흰 줄기가 단단하고 윤기가 있어요',
          '뿌리 쪽에 수분이 남아 있어요',
        ].map((text, j) => ({
          key: ['leaf', 'stem', 'root'][j],
          text,
          source: '팀 작성 초안 · 샘플',
        }))
      : [],
  default_unit: i === 0 ? 'unit:bunch' : i === 1 ? 'kg' : 'each',
  units: i === 0 ? ['unit:bunch', 'kg'] : [i === 1 ? 'kg' : 'each'],
  labels_i18n: { ko: names[i] },
}));
export const markets = [{ market_id: 'market:demo', name: '시연 시장', lat: 37.57, lng: 126.99 }];
export const stores: Store[] = Array.from({ length: 24 }, (_, i) => ({
  store_id: `store:A-${String(i + 1).padStart(2, '0')}`,
  name: `점포 A-${String(i + 1).padStart(2, '0')}`,
  zone_id: zones[Math.floor(i / 4)].id,
  // 대파 파는 점포 3곳은 채소 구역(A-05~A-07)
  sells: i >= 4 && i < 7 ? [items[0].item_id, items[1].item_id] : [items[1 + (i % 4)].item_id],
  map_x: zones[Math.floor(i / 4)].x + 8 + (i % 2) * 80,
  map_y: zones[Math.floor(i / 4)].y + 40 + Math.floor((i % 4) / 2) * 60,
  hours: '09:00–20:00 · 샘플',
  highlight: false,
}));
export const itemName = (id: string) => items.find((i) => i.item_id === id)?.name ?? id;
