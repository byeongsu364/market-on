import type { LatLng } from '../types/contract';

// 길 안내: 목적지만 넘기고 손님 위치는 절대 넣지 않음.
// App scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
// The public web routing format is undocumented; use the specified search fallback.
export type Destination = LatLng & { name: string };

export function directionUrls(dest: Destination, origin: string) {
  const name = encodeURIComponent(dest.name);
  return {
    naverApp: `nmap://route/public?dlat=${dest.lat}&dlng=${dest.lng}&dname=${name}&appname=${encodeURIComponent(origin)}`,
    naverWeb: `https://map.naver.com/p/search/${name}`,
    kakao: `https://map.kakao.com/link/to/${name},${dest.lat},${dest.lng}`,
  };
}

/**
 * 점포를 목적지로(지시서 030 3장 Route). 네이버 지도에서 열 이름(naver_name)이 있으면 그 이름,
 * 없으면 "시장 이름 점포 이름"으로 찾게 함. 점포 좌표가 없으면(지금의 live) 시장 좌표로 대신하고 approximate.
 */
export function storeDestination(
  store: { name: string; naver_name?: string; lat?: number; lng?: number },
  market: Destination,
): Destination & { approximate: boolean } {
  const exact = store.lat != null && store.lng != null;
  return {
    name: store.naver_name ?? `${market.name} ${store.name}`,
    lat: exact ? store.lat! : market.lat,
    lng: exact ? store.lng! : market.lng,
    approximate: !exact,
  };
}

export const formatDistance = (distance: number | null) =>
  distance === null
    ? '거리 정보 없음'
    : distance < 1000
      ? `${Math.round(distance)}m`
      : `${(distance / 1000).toFixed(1)}km`;

/** 두 좌표 사이 거리(m). 시장 안 거리라 평면 근사로 충분함 */
export function distanceM(a: LatLng, b: LatLng) {
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lng - a.lng) * 111320 * Math.cos(lat);
  const dy = (b.lat - a.lat) * 110540;
  return Math.hypot(dx, dy);
}

/** 걸어서 몇 분(분당 70m로 어림). 화면에는 "걸어서 N분"으로만 씀 */
export const walkMinutes = (meters: number) => Math.max(1, Math.round(meters / 70));
