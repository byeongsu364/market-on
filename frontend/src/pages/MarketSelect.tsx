import MarketRequest from '../components/domain/MarketRequest';
import { useSession } from '../store/session';
import { isMock } from '../api/client';
import { useT } from '../i18n';
import { useGeolocation } from '../hooks/useGeolocation';
import { useMarkets } from '../hooks/useMarkets';
import { useMarketChoice } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
export default function MarketSelect() {
  const t = useT();
  const { unsupported, nearbyActive } = useSession();
  const geo = useGeolocation();
  const markets = useMarkets(geo.data?.lat, geo.data?.lng);
  const choose = useMarketChoice();
  return (
    <>
      <h1>{t('selectMarket')}</h1>
      <p>{t('marketPrompt')}</p>
      {geo.loading && <small>{t('locating')}</small>}
      {geo.error && <p className="caption">{geo.error}</p>}
      {unsupported && nearbyActive && (
        <button onClick={() => choose(nearbyActive)}>가까운 지원 시장 · {nearbyActive.name}</button>
      )}
      <Resource state={markets}>
        {markets.data
          ?.slice()
          .sort((a, b) => Number(a.status === 'listed') - Number(b.status === 'listed'))
          .map((m) =>
            m.status === 'listed' ? (
              <section key={m.market_id}>
                <p>준비 중</p>
                <MarketRequest market={m} compact />
              </section>
            ) : (
              <button className="market-option" key={m.market_id} onClick={() => choose(m)}>
                {m.name}
                {isMock && <small>{t('marketSampleCaption')}</small>}
              </button>
            ),
          )}
      </Resource>
    </>
  );
}
