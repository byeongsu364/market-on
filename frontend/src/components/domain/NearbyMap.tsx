import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getPublicConfig } from '../../api/markets';
import { formatDistance } from '../../utils/directions';
import { loadNaverMap, onNaverAuthFailure } from '../../utils/naverMap';
import type { Market } from '../../types/contract';
export default function NearbyMap({
  markets,
  position,
  onSelect,
  children,
}: {
  children?: ReactNode;
  markets: Market[];
  position: { lat: number; lng: number } | null;
  onSelect: (market: Market) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(true);
  // 네이버 인증 실패(등록 안 된 주소) → 깨진 지도 대신 시장 목록
  useEffect(() => onNaverAuthFailure(() => setAvailable(false)), []);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void getPublicConfig()
      .then(async (config) => {
        if (!active) return;
        if (!config.naver_map_client_id) {
          setAvailable(false);
          return;
        }
        const sdk = await loadNaverMap(config.naver_map_client_id);
        if (!active || !ref.current) return;
        const map = new sdk.Map(ref.current, {
          center: new sdk.LatLng(position?.lat ?? 37.5665, position?.lng ?? 126.978),
          zoom: 13,
        });
        const colors = getComputedStyle(document.documentElement);
        const markers = markets.map((market) => {
          const content = document.createElement('button');
          content.type = 'button';
          content.className = 'map-marker';
          content.textContent = `${market.name} · ${formatDistance(market.distance_m)}`;
          content.setAttribute(
            'aria-label',
            `${market.name} · ${formatDistance(market.distance_m)}${market.status === 'listed' ? ' · 준비 중' : ''}`,
          );
          content.style.backgroundColor = colors
            .getPropertyValue(
              market.status === 'active' ? '--color-surface' : '--color-text-secondary',
            )
            .trim();
          if (market.status === 'listed') content.style.filter = 'grayscale(1)';
          content.style.color = colors.getPropertyValue('--color-on-surface').trim();
          const marker = new sdk.Marker({
            map,
            position: new sdk.LatLng(market.lat, market.lng),
            icon: { content },
          });
          const listener = sdk.Event.addListener(marker, 'click', () => onSelect(market));
          const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(market);
            }
          };
          content.addEventListener('keydown', keyboard);
          return () => {
            content.removeEventListener('keydown', keyboard);
            sdk.Event.removeListener(listener);
            marker.setMap(null);
          };
        });
        // 내 위치와 시장 마커가 모두 보이게 맞춤 (서울 시내에서 경동시장 5~6km가 화면 밖으로 나가던 문제)
        if (markets.length) {
          const bounds = new sdk.LatLngBounds(
            new sdk.LatLng(markets[0].lat, markets[0].lng),
            new sdk.LatLng(markets[0].lat, markets[0].lng),
          );
          markets.forEach((m) => bounds.extend(new sdk.LatLng(m.lat, m.lng)));
          if (position) bounds.extend(new sdk.LatLng(position.lat, position.lng));
          map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
        }
        dispose = () => {
          markers.forEach((remove) => remove());
          map.destroy();
        };
        setAvailable(true);
      })
      .catch((error: unknown) => {
        console.info('네이버 지도를 불러오지 못했어요. 키와 등록 도메인을 확인해 주세요.', error);
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [markets, position, onSelect]);
  return available ? (
    <div className="nearby-map" aria-label="주변 시장 지도" ref={ref} />
  ) : (
    <>
      <p className="caption">주변 시장을 목록으로 보여드려요</p>
      {children}
    </>
  );
}
