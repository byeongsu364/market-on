import { useT } from '../i18n';
import { useMapFlow, useRequireMarket, useItemCatalog } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
import MiniMap from '../components/domain/MiniMap';
import StoreSheet from '../components/domain/StoreSheet';
export default function MarketMap() {
  const t = useT();
  const f = useMapFlow();
  const ready = useRequireMarket();
  const catalog = useItemCatalog();
  if (!ready) return null;
  const name = catalog.data?.find((i) => i.item_id === f.item)?.name ?? '품목';
  return (
    <>
      <h1>{t('mapTitle')}</h1>
      <Resource state={f.map}>
        {f.map.data && (
          <>
            <p className="map-summary">
              {f.item
                ? `${name} 파는 점포 ${f.map.data.stores.filter((s) => s.highlight).length}곳`
                : '점포를 눌러 자세히 보세요'}
            </p>
            <p className="caption">{t('mapSampleCaption')}</p>
            <MiniMap map={f.map.data} onStore={f.select} />
            <ul className="store-list">
              {f.map.data.stores
                .filter((s) => (f.item ? s.highlight : !!s.active_sale))
                .map((s) => (
                  <li key={s.store_id}>
                    <button
                      className="secondary wide"
                      onClick={(e) => f.select(s, e.currentTarget)}
                    >
                      {s.name}
                      {s.active_sale && <span className="badge">{t('closingBadge')}</span>}
                    </button>
                  </li>
                ))}
            </ul>
            {f.selected && (
              <StoreSheet
                store={f.selected}
                zone={f.map.data.zones.find((z) => z.id === f.selected?.zone_id)?.name ?? ''}
                onClose={f.close}
                trigger={f.trigger}
              />
            )}
          </>
        )}
      </Resource>
    </>
  );
}
