import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LatLng } from '../../types/contract';
import { markerInner, markerLabel, toMarkers } from './markers';
import type { MapViewProps } from './MapView';
import s from './map.module.css';

// 약도: 지도 타일 없이 연한 면 위에 경계, 핀, 편의시설, 내 위치를 위경도 비례로 그림.
// 구석에 "미리보기 지도"를 적음(지시서 030 6장).
export default function SketchMap(props: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 600 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 390, h: el.clientHeight || 600 });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const markers = toMarkers(props);
  const points: LatLng[] = useMemo(
    () => [
      ...(props.boundary ?? []),
      ...markers.filter((m) => m.type !== 'me' || markers.length < 3),
      ...(props.route ?? []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.boundary,
      props.pins,
      props.facilities,
      props.markets,
      props.stops,
      props.me,
      props.route,
    ],
  );
  const top = (props.topInset ?? 0) + 40;
  const bottom = (props.bottomInset ?? 0) + 40;
  const project = useMemo(() => {
    const c = props.center ?? { lat: 37.57, lng: 126.99 };
    const lats = points.length ? points.map((p) => p.lat) : [c.lat - 0.002, c.lat + 0.002];
    const lngs = points.length ? points.map((p) => p.lng) : [c.lng - 0.002, c.lng + 0.002];
    let [minLat, maxLat, minLng, maxLng] = [
      Math.min(...lats),
      Math.max(...lats),
      Math.min(...lngs),
      Math.max(...lngs),
    ];
    if (maxLat - minLat < 0.0005) [minLat, maxLat] = [minLat - 0.001, maxLat + 0.001];
    if (maxLng - minLng < 0.0005) [minLng, maxLng] = [minLng - 0.001, maxLng + 0.001];
    // 위도 37.5도에서 경도 1도 ≈ 위도 1도의 0.79
    const kx = 0.79;
    const availW = Math.max(size.w - 64, 80);
    const availH = Math.max(size.h - top - bottom, 80);
    const scale = Math.min(availW / ((maxLng - minLng) * kx), availH / (maxLat - minLat));
    const cx = (minLng + maxLng) / 2;
    const cy = (minLat + maxLat) / 2;
    return (p: LatLng) => ({
      x: size.w / 2 + (p.lng - cx) * kx * scale,
      y: top + availH / 2 - (p.lat - cy) * scale,
    });
  }, [points, size, top, bottom, props.center]);
  const boundary = props.boundary?.map(project);
  const poly = boundary?.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const route = props.route?.map(project);
  const labelAt = boundary?.reduce((a, b) => (a.y + a.x * 0.3 < b.y + b.x * 0.3 ? a : b));
  return (
    <div
      ref={ref}
      className={[s.map, props.className ?? ''].join(' ')}
      role="region"
      aria-label={props.label}
      data-map="sketch"
    >
      <svg className={s.layer} width={size.w} height={size.h} aria-hidden="true">
        {poly && (
          <>
            <defs>
              <mask id="mo-outside">
                <rect width={size.w} height={size.h} fill="white" />
                <polygon points={poly} fill="black" />
              </mask>
            </defs>
            <rect
              width={size.w}
              height={size.h}
              fill="#ffffff"
              opacity="0.66"
              mask="url(#mo-outside)"
            />
            <polygon
              points={poly}
              fill="none"
              stroke="#ffffff"
              strokeWidth="7"
              strokeLinejoin="round"
            />
            <polygon
              points={poly}
              fill="none"
              stroke="#171717"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </>
        )}
        {route && route.length > 1 && (
          <polyline
            points={route.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#171717"
            strokeWidth="3"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
        )}
      </svg>
      {labelAt && props.boundaryLabel && (
        <span className="mo-boundary-label" style={{ left: labelAt.x, top: labelAt.y }}>
          {props.boundaryLabel}
        </span>
      )}
      {markers.map((m) => {
        const { x, y } = project(m);
        const interactive =
          !!props.onSelect && (m.type === 'pin' || m.type === 'market' || m.type === 'stop');
        const common = {
          className: 'mo-marker',
          style: { left: x, top: y },
          dangerouslySetInnerHTML: { __html: markerInner(m) },
        };
        return interactive && !(m.type === 'pin' && m.state === 'dim') ? (
          <button
            key={`${m.type}-${m.id}`}
            type="button"
            {...common}
            aria-label={markerLabel(m)}
            onClick={() => props.onSelect?.(m.id, m.type)}
          />
        ) : (
          <span
            key={`${m.type}-${m.id}`}
            {...common}
            data-static="true"
            role={m.type === 'pin' && m.state === 'dim' ? undefined : 'img'}
            aria-hidden={m.type === 'pin' && m.state === 'dim' ? true : undefined}
            aria-label={m.type === 'pin' && m.state === 'dim' ? undefined : markerLabel(m)}
          />
        );
      })}
      <div className={s.corner}>
        <span className={s.note}>미리보기 지도</span>
        {props.sample && <span className={s.note}>핀 위치는 예시</span>}
      </div>
      {props.children}
    </div>
  );
}
