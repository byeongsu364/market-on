// 지시서 030: 지도에 필요한 새 필드의 mock 값.
// 모두 "예시 값"이에요. 시장 경계, 편의시설 위치, 점포 위경도, 영업 여부, 결제 수단, 조회 수, 단골 수는
// 화면을 보여 주려고 넣은 고정 값이고 실제 시장 자료가 아니에요(화면에는 "핀 위치는 예시"를 표시).
// 점포 위경도는 시장 중심 둘레의 예시 경계 안에 구역별로 모아 두고, 실행할 때마다 바뀌지 않게 계산식만 써요.
import type {
  Facility,
  LatLng,
  MarketExtra,
  PaymentMethod,
  Store,
  StoreCategory,
  StoreExtra,
} from '../../types/contract';

/** 시연 시장 중심(기존 mock 값 37.57, 126.99) */
export const DEMO_CENTER: LatLng = { lat: 37.57, lng: 126.99 };
// 위도 1도 ≈ 111km, 경도 1도 ≈ 88km(위도 37.5도)
const M_LAT = 1 / 111000;
const M_LNG = 1 / 88000;
const at = (east_m: number, north_m: number): LatLng => ({
  lat: +(DEMO_CENTER.lat + north_m * M_LAT).toFixed(6),
  lng: +(DEMO_CENTER.lng + east_m * M_LNG).toFixed(6),
});

/** 예시 경계: 동서 약 220m, 남북 약 150m의 다각형 */
export const demoBoundary: LatLng[] = [
  at(-110, 70),
  at(40, 78),
  at(112, 52),
  at(108, -60),
  at(20, -74),
  at(-104, -66),
  at(-116, 4),
];

/** 예시 편의시설 위치 */
export const demoFacilities: Facility[] = [
  { kind: 'entrance', name: '1번 입구', ...at(-116, 4) },
  { kind: 'entrance', name: '2번 입구', ...at(110, -4) },
  { kind: 'parking', name: '공영주차장', ...at(-90, -96) },
  { kind: 'toilet', name: '공중화장실', ...at(28, -50) },
];

export const demoMarketExtra: MarketExtra = {
  boundary: demoBoundary,
  facilities: demoFacilities,
  amenities: { parking: true, toilet: true, onnuri: true },
  address: '시연용 주소 · 샘플',
  store_count: 24,
};

/** 구역 이름 → 카테고리 (category 필드가 서버에서 오기 전까지 쓰는 규칙과 같음) */
const zoneCategory: Record<string, StoreCategory> = {
  청과: 'produce',
  채소: 'produce',
  수산: 'seafood',
  정육: 'meat',
  반찬: 'side',
  '떡·분식': 'ricecake',
};

/** 구역(0~5)마다 모일 자리(시장 중심 기준 m). 3열 2행 */
const zoneCenters: [number, number][] = [
  [-62, 34],
  [6, 38],
  [70, 30],
  [-60, -32],
  [6, -36],
  [68, -28],
];
const payments: PaymentMethod[][] = [
  ['card', 'cash', 'onnuri'],
  ['cash', 'transfer'],
  ['card', 'cash'],
  ['card', 'cash', 'transfer', 'onnuri'],
];
const appleVarieties = [
  ['variety:apple-fuji', 'variety:apple-hongro'],
  ['variety:apple-fuji'],
  ['variety:apple-fuji', 'variety:apple-shinano-gold'],
];

/** 점포 하나의 예시 값. index는 A-01부터 0 */
export function storeExtra(store: Store, index: number, zoneName: string): StoreExtra {
  const zone = Math.floor(index / 4);
  const slot = index % 4;
  const [cx, cy] = zoneCenters[zone] ?? [0, 0];
  const point = at(cx + (slot % 2 ? 14 : -14), cy + (slot < 2 ? 10 : -10));
  return {
    ...point,
    category: zoneCategory[zoneName],
    naver_name: undefined,
    verified: false,
    open_now: index % 7 !== 3,
    payments: payments[index % payments.length],
    varieties: store.sells.includes('item:apple') ? appleVarieties[index % 3] : [],
    sold_out_item_ids: [],
    views_today: 12 + ((index * 37) % 90),
    favorites: 3 + ((index * 13) % 40),
  };
}
