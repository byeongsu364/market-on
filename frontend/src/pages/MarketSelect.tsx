import { useT } from '../i18n';
import { useGeolocation } from '../hooks/useGeolocation';
import { useMarkets } from '../hooks/useMarkets';
import { useMarketChoice } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
export default function MarketSelect() {
  const t = useT();
  const geo = useGeolocation();
  const markets = useMarkets(geo.data?.lat, geo.data?.lng);
  const choose = useMarketChoice();
  return (
    <>
      <h1>{t('selectMarket')}</h1>
      <p>{t('marketPrompt')}</p>
      {geo.loading && <small>{t('locating')}</small>}
      {geo.error && <p className="caption">{geo.error}</p>}
      <Resource state={markets}>
        {markets.data?.map((m) => (
          <button className="market-option" key={m.market_id} onClick={() => choose(m)}>
            {m.name}
            <small>{t('marketSampleCaption')}</small>
          </button>
        ))}
      </Resource>
    </>
  );
}
