import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMultiItemMap } from '../api/stores';
import { useResource } from './useResource';
import { useItemCatalog } from './useFlows';
import { distanceM, missingItems, planRoute, walkMinutes } from '../utils/shopRoute';
import type { LatLng } from '../types/contract';

/** 장보기 구성에서 넘어온 줄(이동 상태). 공유 링크로 열면 없음 */
export type ShopLine = { item_id: string; name: string; quantity: number; unit_label: string };
export type RouteState = { lines?: ShopLine[]; total?: number; budget?: number };

/** /shop/route 주소: 품목은 item을 여러 번 */
export function routeHref(base: string, itemIds: string[]) {
  const [path, query = ''] = base.split('?');
  const params = new URLSearchParams(query);
  params.delete('item');
  itemIds.forEach((id) => params.append('item', id));
  return `${path}?${params.toString()}`;
}

function readDone(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(saved) ? saved.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 여러 품목 동선: 지도 응답 + 가까운 순서 + 산 곳 체크 */
export function useShopRoute(marketId: string, itemIds: string[], lines?: ShopLine[]) {
  const key = itemIds.join(',');
  const map = useResource(
    useCallback(
      () => (marketId && key ? getMultiItemMap(marketId, key.split(',')) : Promise.resolve(null)),
      [marketId, key],
    ),
  );
  const catalog = useItemCatalog();
  const doneKey = `shop-route:${marketId}:${key}`;
  const [done, setDone] = useState<{ key: string; ids: string[] }>(() => ({
    key: doneKey,
    ids: readDone(doneKey),
  }));
  const doneIds = done.key === doneKey ? done.ids : readDone(doneKey);
  useEffect(() => {
    try {
      sessionStorage.setItem(doneKey, JSON.stringify(doneIds));
    } catch {
      /* 기억하지 못해도 화면은 그대로 */
    }
  }, [doneKey, doneIds]);
  const data = map.data;
  // 출발점: 시장 입구(편의시설), 없으면 경계의 가운데. 손님 위치는 쓰지 않음(위치 권한 없이도 동작)
  const start = useMemo<LatLng | null>(() => {
    const entrance = data?.facilities?.find((f) => f.kind === 'entrance');
    if (entrance) return { lat: entrance.lat, lng: entrance.lng };
    const b = data?.boundary;
    if (b?.length)
      return {
        lat: b.reduce((sum, p) => sum + p.lat, 0) / b.length,
        lng: b.reduce((sum, p) => sum + p.lng, 0) / b.length,
      };
    return null;
  }, [data]);
  const stops = useMemo(
    () =>
      data
        ? planRoute(
            data.stores.filter((st) => st.highlight),
            itemIds,
            start,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, key, start],
  );
  const located =
    stops.length > 0 && stops.every((st) => st.store.lat != null && st.store.lng != null);
  const nameOf = (id: string) =>
    lines?.find((l) => l.item_id === id)?.name ??
    catalog.data?.find((i) => i.item_id === id)?.name ??
    id;
  const remaining = stops.filter((st) => !doneIds.includes(st.store.store_id));
  // 남은 곳까지 거리: 마지막으로 산 곳(없으면 출발점)에서 남은 순서대로
  const remainingLegs = remaining.map((st) => {
    const index = stops.indexOf(st);
    const prev = index > 0 ? stops[index - 1].store : null;
    if (!located) return null;
    if (
      prev &&
      prev.lat != null &&
      prev.lng != null &&
      st.store.lat != null &&
      st.store.lng != null
    )
      return distanceM({ lat: prev.lat, lng: prev.lng }, { lat: st.store.lat, lng: st.store.lng });
    return st.leg_m;
  });
  return {
    map,
    data,
    stops,
    start,
    located,
    done: doneIds,
    toggle: (storeId: string) =>
      setDone({
        key: doneKey,
        ids: doneIds.includes(storeId)
          ? doneIds.filter((id) => id !== storeId)
          : [...doneIds, storeId],
      }),
    remaining,
    minutes: walkMinutes(remainingLegs),
    missing: missingItems(stops, itemIds).map(nameOf),
    nameOf,
  };
}
export type ShopRouteState = ReturnType<typeof useShopRoute>;
