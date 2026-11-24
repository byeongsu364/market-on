import { useState } from 'react';
import { useMarkets } from '../../hooks/useMarkets';
import { useMarketMap } from '../../hooks/useMarketMap';
import MiniMap from '../../components/domain/MiniMap';
import Resource from '../../components/common/Resource';
import AuthForm from '../../components/domain/AuthForm';
import { useT } from '../../i18n';
export default function MerchantSignup() {
  const t = useT();
  const markets = useMarkets();
  const [market, setMarket] = useState('');
  const [store, setStore] = useState('');
  const map = useMarketMap(market);
  const step = !market ? 1 : !store ? 2 : 3;
  return (
    <>
      <h1>{t('signup')}</h1>
      <p>{step}/3</p>
      {step === 1 ? (
        <>
          <h2>{t('selectMarket')}</h2>
          <Resource state={markets}>
            {markets.data?.map((m) => (
              <button
                className="market-option"
                key={m.market_id}
                onClick={() => setMarket(m.market_id)}
              >
                {m.name}
              </button>
            ))}
          </Resource>
        </>
      ) : step === 2 ? (
        <>
          <h2>{t('chooseStore')}</h2>
          <Resource state={map}>
            {map.data && <MiniMap map={map.data} onStore={(s) => setStore(s.store_id)} />}
            <div className="chips">
              {map.data?.stores.map((s) => (
                <button key={s.store_id} className="chip" onClick={() => setStore(s.store_id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </Resource>
        </>
      ) : (
        <>
          <p>{map.data?.stores.find((s) => s.store_id === store)?.name}</p>
          <AuthForm storeId={store} />
        </>
      )}
      {step > 1 && (
        <button className="secondary" onClick={() => (store ? setStore('') : setMarket(''))}>
          {t('previous')}
        </button>
      )}
    </>
  );
}
