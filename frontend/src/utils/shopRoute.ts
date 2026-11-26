import type { LatLng, Store } from '../types/contract';

// 장보기 동선(지시서 030 3장 ShopRoute). 방문 순서는 서버가 아니라 프런트에서 계산함.
// 출발점에서 가장 가까운 "아직 안 산 품목을 파는 점포"로 가고, 그 점포에서 살 수 있는 품목은 함께 삼.
// 점포 좌표(lat, lng)가 없는 응답(지금의 live)이면 거리 계산 없이 품목 순서대로 첫 판매 점포를 씀.

export type RouteStop = {
  store: Store;
  item_ids: string[];
  /** 앞 지점에서 이 점포까지 거리(m). 좌표가 없으면 null */
  leg_m: number | null;
};

/** 두 지점 사이 거리(m). 시장 안처럼 짧은 거리라 평면 근사로 충분함 */
export function distanceM(a: LatLng, b: LatLng) {
  const dy = (a.lat - b.lat) * 111000;
  const dx = (a.lng - b.lng) * 111000 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const hasPoint = (s: Store): s is Store & LatLng => s.lat != null && s.lng != null;

export function planRoute(stores: Store[], itemIds: string[], start?: LatLng | null): RouteStop[] {
  const left = new Set(itemIds);
  const stops: RouteStop[] = [];
  const sellers = (id: string) => stores.filter((s) => s.sells.includes(id));
  const located = stores.some(hasPoint);
  let here = start ?? null;
  while (left.size) {
    let best: { store: Store; d: number | null } | null = null;
    for (const id of itemIds) {
      if (!left.has(id)) continue;
      for (const s of sellers(id)) {
        if (stops.some((stop) => stop.store.store_id === s.store_id)) continue;
        const d = located && here && hasPoint(s) ? distanceM(here, s) : null;
        if (!best) best = { store: s, d };
        else if (d != null && (best.d == null || d < best.d)) best = { store: s, d };
      }
      // 좌표가 없으면 품목 순서대로 첫 판매 점포
      if (!located && best) break;
    }
    if (!best) break; // 남은 품목을 파는 점포가 없음
    const bought = [...left].filter((id) => best.store.sells.includes(id));
    bought.forEach((id) => left.delete(id));
    stops.push({ store: best.store, item_ids: bought, leg_m: best.d });
    if (hasPoint(best.store)) here = { lat: best.store.lat, lng: best.store.lng };
  }
  return stops;
}

/** 파는 점포가 없어 동선에 넣지 못한 품목 */
export const missingItems = (stops: RouteStop[], itemIds: string[]) =>
  itemIds.filter((id) => !stops.some((s) => s.item_ids.includes(id)));

/** 걸어서 걸리는 분(분속 67m ≈ 시속 4km). 거리를 모르면 null */
export function walkMinutes(meters: (number | null)[]) {
  if (!meters.length || meters.some((m) => m == null)) return null;
  const total = meters.reduce<number>((sum, m) => sum + (m ?? 0), 0);
  return Math.max(1, Math.round(total / 67));
}
