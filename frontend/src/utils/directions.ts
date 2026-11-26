import type { Market } from '../types/contract';
// Only destination data is accepted. Never include the user's coordinates.
// App scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
// The public web routing format is undocumented; use the specified search fallback.
export function directionUrls(market: Market, origin: string) {
  const name = encodeURIComponent(market.name);
  return {
    naverApp: `nmap://route/public?dlat=${market.lat}&dlng=${market.lng}&dname=${name}&appname=${encodeURIComponent(origin)}`,
    naverWeb: `https://map.naver.com/p/search/${name}`,
    kakao: `https://map.kakao.com/link/to/${name},${market.lat},${market.lng}`,
  };
}
export const formatDistance = (distance: number | null) =>
  distance === null
    ? '거리 정보 없음'
    : distance < 1000
      ? `${Math.round(distance)}m`
      : `${(distance / 1000).toFixed(1)}km`;
