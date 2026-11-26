import { useCallback, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSession } from '../store/session';
import { useNearbyMarkets, mapMode, type MapMode } from '../hooks/useNearbyMarkets';
import { useResource } from '../hooks/useResource';
import { getMarketItems } from '../api/markets';
import type { Market } from '../types/contract';
import NearbyMap from '../components/domain/NearbyMap';
import MarketCard from '../components/domain/MarketCard';
import Directions from '../components/domain/Directions';
import Sheet from '../components/common/Sheet';
import { isMock } from '../api/client';
import { useT } from '../i18n';
import { useMapFlow, useItemCatalog } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
import MiniMap from '../components/domain/MiniMap';
import StoreSheet from '../components/domain/StoreSheet';
const LIST_LIMIT = 10;

export default function MarketMap() {
  const t = useT();
  const f = useMapFlow();
  const session = useSession();
  const nearby = useNearbyMarkets();
  const [params, setParams] = useSearchParams();
  const [override, setOverride] = useState<MapMode | null>(null);
  const mode =
    override ?? mapMode(f.item, session.market, nearby.position ? (nearby.markets.data ?? []) : []);
  const items = useResource(
    useCallback(
      async () => (session.market ? getMarketItems(session.market.market_id) : []),
      [session.market],
    ),
  );
  const [selected, setSelected] = useState<Market | null>(null);
  const [destination, setDestination] = useState<Market | null>(null);
  const closeMarket = useCallback(() => setSelected(null), []);
  const closeDirections = useCallback(() => setDestination(null), []);
  const explore = (market: Market) => {
    f.close();
    setExpandedFor(null);
    session.setMarket(market);
    setSelected(null);
    setOverride('inside');
    setParams({});
  };

  const catalog = useItemCatalog();
  // 경동시장처럼 점포가 많으면 목록이 길어져서 처음 10곳만 (지도에는 모두 표시)
  const [expandedFor, setExpandedFor] = useState<string | null>(null);

  const name =
    items.data?.find((i) => i.item_id === f.item)?.name ??
    catalog.data?.find((i) => i.item_id === f.item)?.name ??
    '품목';
  return (
    <>
      <h1>{t('mapTitle')}</h1>
      <div className="chips" aria-label="지도 모드">
        <button
          className="chip"
          aria-pressed={mode === 'inside'}
          onClick={() => setOverride('inside')}
        >
          시장 안 지도
        </button>
        <button
          className="chip"
          aria-pressed={mode === 'outside'}
          onClick={() => {
            f.close();
            setOverride('outside');
          }}
        >
          주변 시장
        </button>
      </div>
      {mode === 'outside' ? (
        <Resource state={nearby.markets}>
          {nearby.markets.data && (
            <>
              <NearbyMap
                markets={nearby.markets.data}
                position={nearby.position ?? null}
                onSelect={setSelected}
              >
                {nearby.markets.data.map((market) => (
                  <MarketCard
                    key={market.market_id}
                    market={market}
                    onExplore={explore}
                    onDirections={setDestination}
                  />
                ))}
              </NearbyMap>
              {nearby.markets.data.length === 0 && <p>5km 안에 등록된 시장이 없어요</p>}
            </>
          )}
        </Resource>
      ) : (
        <>
          {!session.market && (
            <Link
              to="/markets"
              state={{ from: '/map' + (params.size ? '?' + params.toString() : '') }}
            >
              시장을 선택해 주세요
            </Link>
          )}
          <Resource state={items}>
            <div className="chips" aria-label="시장 품목">
              <button
                aria-pressed={!f.item}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('item');
                  next.delete('unit');
                  setParams(next);
                }}
              >
                전체
              </button>
              {items.data?.map((item) => (
                <button
                  key={item.item_id}
                  aria-pressed={f.item === item.item_id}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('item', item.item_id);
                    next.delete('unit');
                    setParams(next);
                    setExpandedFor(null);
                  }}
                >
                  {item.name} {item.store_count}곳
                </button>
              ))}
            </div>
          </Resource>
          <Resource state={f.map}>
            {f.map.data && (
              <>
                <p className="map-summary">
                  {f.item
                    ? `${name} 파는 점포 ${f.map.data.stores.filter((s) => s.highlight).length}곳`
                    : '점포를 눌러 자세히 보세요'}
                </p>
                {isMock && <p className="caption">{t('mapSampleCaption')}</p>}
                <MiniMap map={f.map.data} onStore={f.select} itemName={f.item ? name : undefined} />
                <ul className="store-list">
                  {f.map.data.stores
                    .filter((s) => (f.item ? s.highlight : !!s.active_sale))
                    .slice(0, expandedFor === (f.item ?? '') ? undefined : LIST_LIMIT)
                    .map((s) => (
                      <li key={s.store_id}>
                        <button
                          className="secondary wide"
                          onClick={(e) => f.select(s, e.currentTarget)}
                        >
                          {s.name}
                          {f.item && s.guessed_item_ids.includes(f.item) && (
                            <small>업종 기준 · 상인 확인 전</small>
                          )}
                          {s.active_sale && <span className="badge">{t('closingBadge')}</span>}
                        </button>
                      </li>
                    ))}
                </ul>
                {expandedFor !== (f.item ?? '') &&
                  f.map.data.stores.filter((s) => (f.item ? s.highlight : !!s.active_sale)).length >
                    LIST_LIMIT && (
                    <button className="secondary wide" onClick={() => setExpandedFor(f.item ?? '')}>
                      더 보기
                    </button>
                  )}
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
      )}
      {selected && !destination && (
        <Sheet title={selected.name} onClose={closeMarket}>
          <MarketCard market={selected} onExplore={explore} onDirections={setDestination} />
        </Sheet>
      )}
      {destination && <Directions market={destination} onClose={closeDirections} />}
    </>
  );
}
