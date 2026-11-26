import { useSearchParams } from 'react-router-dom';
import { useMarketMap } from '../hooks/useMarketMap';
import StorePriceDisplay from '../components/domain/StorePriceDisplay';
import { getMarkets } from '../api/markets';
import { Link, useParams } from 'react-router-dom';
import { usePublicStore } from '../hooks/useSales';
import Resource from '../components/common/Resource';
import StoreCard from '../components/domain/StoreCard';
import { useEffect } from 'react';
import { useSession } from '../store/session';
import { useT } from '../i18n';
export default function StorePage() {
  const { storeId = '' } = useParams();
  const state = usePublicStore(storeId);
  const t = useT();
  const [params] = useSearchParams();
  const selectedItem = params.get('item') ?? undefined;
  const map = useMarketMap(
    state.data?.store.market_id ?? '',
    selectedItem,
    params.get('unit') ?? undefined,
  );
  const session = useSession();
  useEffect(() => {
    if (!state.data) return;
    let active = true;
    const marketId = state.data.store.market_id;
    session.setStoreContext({ store_id: storeId, market_id: marketId });
    if (session.market?.market_id !== marketId) {
      void getMarkets()
        .then((markets) => {
          const market = markets.find((m) => m.market_id === marketId);
          if (active && market) session.setMarket(market);
        })
        .catch(() => {
          /* market choice remains available */
        });
    }
    return () => {
      active = false;
    };
    // Keep the QR context for the next scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.store.market_id, storeId]);
  return (
    <Resource state={state}>
      {state.data && (
        <>
          <h1>{state.data.store.name}</h1>
          {state.data.source === 'sbiz' && <p className="caption">공공데이터 상호명</p>}
          <p>
            {t('hoursPrefix')}
            {state.data.store.hours.open}–{state.data.store.hours.close}
          </p>
          <Link className="button" to="/scan">
            이 점포에서 찍기
          </Link>
          {selectedItem && (
            <Resource state={map}>
              <StorePriceDisplay
                price={map.data?.stores.find((s) => s.store_id === storeId)?.price ?? null}
              />
            </Resource>
          )}
          <h2>{t('sells')}</h2>
          <div className="chips">
            {state.data.items.map((i) => (
              <Link
                className="item-chip"
                key={i.item_id}
                to={`/items/${encodeURIComponent(i.item_id)}`}
              >
                {i.name}
                {state.data?.guessed_item_ids.includes(i.item_id) && (
                  <small>업종 기준 · 상인 확인 전</small>
                )}
              </Link>
            ))}
          </div>
          {state.data.sales.length > 0 && (
            <section>
              <h2>{t('closingSales')}</h2>
              {state.data.sales.map((s) => (
                <StoreCard key={s.id} sale={s} />
              ))}
            </section>
          )}
        </>
      )}
    </Resource>
  );
}
