import { useEffect, useRef } from 'react';
import type { NaverMaps } from '../../utils/naverMap';
import { markerInner, markerLabel, toMarkers } from './markers';
import type { MapViewProps } from './MapView';
import s from './map.module.css';

// 네이버 지도 위에 같은 표시물을 HTML 마커로 올림. 경계는 2px 선 폴리곤, 바깥은 흰 면 66%(구멍 뚫린 폴리곤).
export default function NaverMap({ maps, ...props }: MapViewProps & { maps: NaverMaps }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<InstanceType<NaverMaps['Map']> | null>(null);
  useEffect(() => {
    if (!node.current) return;
    const c = props.center ?? props.boundary?.[0] ?? props.pins?.[0] ?? props.markets?.[0];
    map.current = new maps.Map(node.current, {
      center: c ? new maps.LatLng(c.lat, c.lng) : undefined,
      zoom: 17,
      scaleControl: false,
      mapDataControl: false,
      logoControlOptions: { position: 3 },
    });
    return () => {
      map.current?.destroy();
      map.current = null;
    };
    // 지도는 한 번 만들고 표시물만 다시 그림
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);
  const markers = toMarkers(props);
  const key = JSON.stringify([markers, props.boundary, props.route]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const overlays: { setMap: (map: null) => void }[] = [];
    const listeners: object[] = [];
    const bounds = new maps.LatLngBounds(new maps.LatLng(90, 180), new maps.LatLng(-90, -180));
    let fitted = 0;
    if (props.boundary?.length && maps.Polygon) {
      const ring = props.boundary.map((p) => new maps.LatLng(p.lat, p.lng));
      const world = [
        new maps.LatLng(38.7, 124),
        new maps.LatLng(38.7, 132),
        new maps.LatLng(33, 132),
        new maps.LatLng(33, 124),
      ];
      overlays.push(
        new maps.Polygon({
          map: m,
          paths: [world, ring],
          fillColor: '#ffffff',
          fillOpacity: 0.66,
          strokeOpacity: 0,
          clickable: false,
        }),
        new maps.Polygon({
          map: m,
          paths: [ring],
          fillOpacity: 0,
          strokeColor: '#171717',
          strokeWeight: 2,
          clickable: false,
        }),
      );
      ring.forEach((p) => bounds.extend(p));
      fitted += ring.length;
    }
    if (props.route && props.route.length > 1 && maps.Polyline) {
      overlays.push(
        new maps.Polyline({
          map: m,
          path: props.route.map((p) => new maps.LatLng(p.lat, p.lng)),
          strokeColor: '#171717',
          strokeWeight: 3,
          strokeStyle: 'shortdot',
          clickable: false,
        }),
      );
    }
    for (const mk of markers) {
      const position = new maps.LatLng(mk.lat, mk.lng);
      const clickable =
        !!props.onSelect && (mk.type === 'pin' || mk.type === 'market' || mk.type === 'stop');
      const html = `<button type="button" class="mo-marker" ${clickable ? '' : 'data-static="true" tabindex="-1"'} aria-label="${markerLabel(mk).replace(/"/g, '&quot;')}">${markerInner(mk)}</button>`;
      const marker = new maps.Marker({
        map: m,
        position,
        clickable,
        zIndex: mk.type === 'pin' && mk.state === 'selected' ? 200 : mk.type === 'me' ? 150 : 100,
        icon: { content: html, ...(maps.Point ? { anchor: new maps.Point(0, 0) } : {}) },
      });
      overlays.push(marker);
      if (clickable)
        listeners.push(
          maps.Event.addListener(marker, 'click', () => props.onSelect?.(mk.id, mk.type)),
        );
      if (mk.type !== 'me' || markers.length < 3) {
        bounds.extend(position);
        fitted += 1;
      }
    }
    if (fitted > 1)
      m.fitBounds(bounds, {
        top: (props.topInset ?? 0) + 40,
        bottom: (props.bottomInset ?? 0) + 40,
        left: 32,
        right: 32,
      });
    return () => {
      listeners.forEach((l) => maps.Event.removeListener(l));
      overlays.forEach((o) => o.setMap(null));
    };
    // key가 표시물 전체를 대신함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maps]);
  return (
    <div className={[s.map, props.className ?? ''].join(' ')} data-map="naver">
      <div ref={node} className={s.naver} role="region" aria-label={props.label} />
      {props.sample && (
        <div className={s.corner}>
          <span className={s.note}>핀 위치는 예시</span>
        </div>
      )}
      {props.children}
    </div>
  );
}
