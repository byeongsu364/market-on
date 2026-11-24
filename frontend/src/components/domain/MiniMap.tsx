import { useT } from '../../i18n';
import type { CSSProperties } from 'react';
import type { MarketMap, Store } from '../../types/contract';
import { zoneColors } from '../../constants/zones';
export default function MiniMap({
  map,
  onStore,
}: {
  map: MarketMap;
  onStore: (store: Store, trigger: Element) => void;
}) {
  const t = useT();
  return (
    <>
      <svg
        className="market-map"
        viewBox="0 0 376 548"
        role="group"
        aria-label={t('mapLabel')}
        style={Object.fromEntries(zoneColors.map((c, i) => [`--zone-${i}`, c])) as CSSProperties}
      >
        {map.zones.map((z, i) => (
          <g key={z.id}>
            <rect
              x={z.x}
              y={z.y}
              width="172"
              height="172"
              rx="8"
              fill={`var(--zone-${i})`}
              fillOpacity="0.2"
            />
            <text x={z.x + 12} y={z.y + 26}>
              {z.name}
            </text>
          </g>
        ))}
        {map.stores.map((s) => (
          <g
            key={s.store_id}
            role="button"
            tabIndex={0}
            aria-label={`${s.name}${s.highlight ? ' · 판매 점포' : ''}`}
            data-highlight={s.highlight}
            onClick={(e) => onStore(s, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStore(s, e.currentTarget);
              }
            }}
          >
            <rect
              className={s.highlight ? 'store highlighted' : 'store'}
              x={s.map_x}
              y={s.map_y}
              width="72"
              height="54"
              rx="4"
            />
            <text className={s.highlight ? 'highlight-label' : ''} x={s.map_x + 8} y={s.map_y + 32}>
              {s.name.slice(3)}
            </text>
            {s.active_sale && (
              <>
                <rect
                  className="sale-map-badge-bg"
                  x={s.map_x + 2}
                  y={s.map_y + 34}
                  width="68"
                  height="18"
                  rx="4"
                />
                <text className="sale-map-badge" x={s.map_x + 6} y={s.map_y + 48}>
                  {t('closingBadge')}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      <ul
        className="legend"
        style={Object.fromEntries(zoneColors.map((c, i) => [`--zone-${i}`, c])) as CSSProperties}
      >
        {map.zones.map((z, i) => (
          <li key={z.id}>
            <span style={{ background: `var(--zone-${i})` }} />
            {z.name}
          </li>
        ))}
      </ul>
    </>
  );
}
