// Minimal JS v3 surface; the SDK is loaded dynamically, without a package.
type Overlay = { setMap: (map: null) => void };
type Listener = object;
export type NaverMaps = {
  Map: new (
    node: HTMLElement,
    options: object,
  ) => { destroy: () => void; fitBounds: (bounds: object, margin?: object) => void };
  LatLng: new (lat: number, lng: number) => object;
  LatLngBounds: new (sw: object, ne: object) => { extend: (point: object) => void };
  Marker: new (options: object) => Overlay;
  // 030: 시장 경계(구멍 뚫린 폴리곤), 장보기 동선 선, HTML 마커 기준점
  Polygon?: new (options: object) => Overlay;
  Polyline?: new (options: object) => Overlay;
  Point?: new (x: number, y: number) => object;
  Event: {
    addListener: (target: Overlay, event: string, callback: () => void) => Listener;
    removeListener: (listener: Listener) => void;
  };
};
declare global {
  interface Window {
    naver?: { maps: NaverMaps };
    navermap_authFailure?: () => void;
  }
}
// 등록되지 않은 도메인이면 SDK는 정상으로 불러와지고, 인증 실패는 나중에 이 전역 함수로만 알려 줌
// (2026-11-26: Cloudflare 임시 주소에서 지도가 깨진 채로 보이던 문제)
let authFailed = false;
const authListeners = new Set<() => void>();
window.navermap_authFailure = () => {
  authFailed = true;
  authListeners.forEach((listener) => listener());
};
export function onNaverAuthFailure(listener: () => void): () => void {
  if (authFailed) listener();
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}
let loading: Promise<NaverMaps> | undefined;
export function loadNaverMap(clientId: string): Promise<NaverMaps> {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'naver-maps-sdk';
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) reject(error);
      else if (window.naver?.maps) resolve(window.naver.maps);
      else reject(new Error('네이버 지도 SDK를 확인해 주세요.'));
    };
    const timer = setTimeout(() => finish(new Error('네이버 지도 로드 시간 초과')), 10000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('네이버 지도 키와 등록 도메인을 확인해 주세요.'));
    document.head.appendChild(script);
  });
  return loading;
}
