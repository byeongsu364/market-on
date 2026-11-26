import type { CSSProperties } from 'react';
import type { MarketMap, Store } from '../../types/contract';
import { zoneColors } from '../../constants/zones';
import s from './MiniMap.module.css';

// 구역 평면도. 점포에 좌표가 없는 응답(지금의 live)에서 지도 자리에 넣고 안내 문구는 그대로 둠(지시서 030 6장).
export default function MiniMap({
  map,
  onStore,
  itemName,
  selectedId,
}: {
  map: MarketMap;
  onStore?: (store: Store, trigger: Element) => void;
  itemName?: string;
  selectedId?: string;
}) {
  const focused = itemName
    ? [...map.zones]
        .sort(
          (a, b) =>
            map.stores.filter((s) => s.highlight && s.zone_id === b.id).length -
            map.stores.filter((s) => s.highlight && s.zone_id === a.id).length,
        )
        .find((z) => map.stores.some((s) => s.highlight && s.zone_id === z.id))
    : undefined;
  const focusedStores = map.stores.filter((s) => s.zone_id === focused?.id);
  const viewBox = focused
    ? `${Math.max(0, focused.x - 8)} ${Math.max(0, focused.y - 8)} 188 ${Math.max(188, ...focusedStores.map((s) => s.map_y - focused.y + 72))}`
    : `0 0 376 ${Math.max(548, ...map.stores.map((s) => s.map_y + 64))}`;
  const zoneVars = Object.fromEntries(
    zoneColors.map((c, i) => [`--zone-${i}`, c]),
  ) as CSSProperties;
  return (
    <div className={s.wrap}>
      {map.layout === 'schematic' && (
        <p className="caption">배치는 업종별 예시예요 · 실제 위치는 현장에서 확인해 주세요</p>
      )}
      <p className="caption">{map.source_note}</p>
      <svg
        className={s.map}
        viewBox={viewBox}
        data-focused-zone={focused?.id}
        role="group"
        aria-label="시장 점포 평면도"
        style={zoneVars}
      >
        {map.zones.map((z, i) => (
          <g key={z.id}>
            <rect
              className={s.zone}
              x={z.x}
              y={z.y}
              width="172"
              height={Math.max(
                172,
                ...map.stores.filter((s) => s.zone_id === z.id).map((s) => s.map_y - z.y + 60),
              )}
              rx="8"
              fill={`var(--zone-${i % zoneColors.length})`}
            />
            {/* 파는 점포가 있는 구역에만 개수 표시 ("사과 0곳"은 숨김) */}
            {itemName && map.stores.some((s) => s.highlight && s.zone_id === z.id) && (
              <text x={z.x + 12} y={z.y + 10}>
                {itemName} {map.stores.filter((s) => s.highlight && s.zone_id === z.id).length}곳
              </text>
            )}
            <text x={z.x + 12} y={z.y + 26}>
              {z.name}
            </text>
          </g>
        ))}
        {map.stores.map((store) => {
          const selected = store.store_id === selectedId;
          return (
            <g
              key={store.store_id}
              role={onStore ? 'button' : undefined}
              tabIndex={onStore ? 0 : undefined}
              aria-label={`${store.name}${store.highlight ? ' · 판매 점포' : ''}${selected ? ' · 선택됨' : ''}`}
              data-highlight={store.highlight}
              onClick={(e) => onStore?.(store, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onStore?.(store, e.currentTarget);
                }
              }}
            >
              <rect
                className={[
                  s.store,
                  selected ? s.selected : store.highlight ? s.highlighted : '',
                ].join(' ')}
                x={store.map_x}
                y={store.map_y}
                width="72"
                height="54"
                rx="4"
              />
              <text
                className={selected ? s.onSignal : store.highlight ? s.onInk : ''}
                x={store.map_x + 8}
                y={store.map_y + 32}
              >
                {store.source === 'sbiz' ? store.name : store.name.slice(3)}
              </text>
              {store.active_sale && (
                <>
                  <rect
                    className={s.saleBg}
                    x={store.map_x + 2}
                    y={store.map_y + 34}
                    width="68"
                    height="18"
                    rx="4"
                  />
                  <text className={s.sale} x={store.map_x + 6} y={store.map_y + 48}>
                    마감세일
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <ul className={s.legend} style={zoneVars}>
        {map.zones.map((z, i) => (
          <li key={z.id}>
            <span style={{ background: `var(--zone-${i % zoneColors.length})` }} />
            {z.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
