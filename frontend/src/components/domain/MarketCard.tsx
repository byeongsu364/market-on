import { useCallback } from 'react';
import type { Market } from '../../types/contract';
import { getMarketItems } from '../../api/markets';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useResource } from '../../hooks/useResource';
import Resource from '../common/Resource';
import MarketRequest from './MarketRequest';
import { formatDistance } from '../../utils/directions';
function Preview({ market }: { market: Market }) {
  const map = useMarketMap(market.market_id);
  const items = useResource(
    useCallback(() => getMarketItems(market.market_id), [market.market_id]),
  );
  return (
    <>
      <Resource state={map}>
        {/* 카드 크기에서는 점포 지도가 읽히지 않아서 구역 이름·점포 수로 보여 줌 */}
        {map.data && (
          <>
            <ul className="chips" aria-label="구역">
              {map.data.zones.map((z) => (
                <li key={z.id} className="chip">
                  {z.name} {map.data?.stores.filter((s) => s.zone_id === z.id).length}곳
                </li>
              ))}
            </ul>
            {map.data.layout === 'schematic' && (
              <p className="caption">배치는 업종별 예시예요 · 실제 위치는 현장에서 확인해 주세요</p>
            )}
          </>
        )}
      </Resource>
      <Resource state={items}>{items.data && <p>품목 {items.data.length}종</p>}</Resource>
    </>
  );
}
export default function MarketCard({
  market,
  onExplore,
  onDirections,
}: {
  market: Market;
  onExplore: (market: Market) => void;
  onDirections: (market: Market) => void;
}) {
  return (
    <article className="card">
      <h2>{market.name}</h2>
      <p>{formatDistance(market.distance_m)}</p>
      {market.status === 'active' ? (
        <>
          <Preview market={market} />
          <button className="wide" onClick={() => onExplore(market)}>
            이 시장 둘러보기
          </button>
        </>
      ) : (
        <MarketRequest market={market} />
      )}
      <button className="secondary wide" onClick={() => onDirections(market)}>
        길 안내
      </button>
    </article>
  );
}
