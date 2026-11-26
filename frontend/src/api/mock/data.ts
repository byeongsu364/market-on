import type { Item, Store } from '../../types/contract';
import { zones } from '../../constants/zones';
export const source = 'aT 기간별 소매가격 · 2026-11-20 조사 · 샘플';
const names = ['대파', '양파', '사과', '배', '단감', '귤'];
const ids = ['green_onion', 'onion', 'apple', 'pear', 'sweet_persimmon', 'mandarin'];
export const items: Item[] = ids.map((id, i) => ({
  item_id: `item:${id}`,
  name: names[i],
  synonyms:
    id === 'mandarin'
      ? ['귤', '감귤', '밀감', 'mandarin', 'tangerine']
      : i === 0
        ? ['대파', '파']
        : [names[i], id],
  vision_labels: id === 'mandarin' ? [] : i === 0 ? ['green onion', 'scallion'] : [id],
  criteria:
    id === 'mandarin'
      ? [
          {
            key: 'skin',
            text: '껍질이 얇고 껍질과 과육 사이에 빈 공간 없이 붙어 있어요',
            source: '농식품 이달의 식재료 - 귤',
          },
          {
            key: 'shape',
            text: '꼭지 부분이 튀어나오지 않고 좌우로 둥글고 납작해요',
            source: '농식품 이달의 식재료 - 귤',
          },
          {
            key: 'stem',
            text: '색이 짙은 주황색이고 꼭지는 녹색으로 단단히 붙어 있어요',
            source: '농식품 이달의 식재료 - 귤',
          },
          {
            key: 'gloss',
            text: '껍질에 지나치게 윤이 나지 않아요',
            source: '농식품 이달의 식재료 - 귤',
          },
        ]
      : i === 0
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
export const markets: import('../../types/contract').Market[] = [
  {
    status: 'active',
    distance_m: null,
    market_id: 'market:demo',
    name: '시연 시장',
    lat: 37.57,
    lng: 126.99,
  },
  {
    status: 'listed',
    distance_m: null,
    market_id: 'market:std-sample',
    name: '미지원 시장 · 샘플',
    lat: 37.58,
    lng: 126.99,
  },
];
export const stores: Store[] = Array.from({ length: 24 }, (_, i) => ({
  source: 'manual',
  items_basis: 'merchant',
  guessed_item_ids: [],
  store_id: `store:A-${String(i + 1).padStart(2, '0')}`,
  name: `점포 A-${String(i + 1).padStart(2, '0')}`,
  zone_id: zones[Math.floor(i / 4)].id,
  // 대파 파는 점포 3곳은 채소 구역(A-05~A-07)
  sells: i >= 4 && i < 7 ? [items[0].item_id, items[1].item_id] : [items[1 + (i % 4)].item_id],
  map_x: zones[Math.floor(i / 4)].x + 8 + (i % 2) * 80,
  map_y: zones[Math.floor(i / 4)].y + 40 + Math.floor((i % 4) / 2) * 60,
  hours: '09:00–20:00 · 샘플',
  highlight: false,
  price: null,
}));
export const itemName = (id: string) => items.find((i) => i.item_id === id)?.name ?? id;
