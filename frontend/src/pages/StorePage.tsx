import { useParams } from 'react-router-dom';
import { usePublicStore } from '../hooks/useSales';
import Resource from '../components/common/Resource';
import StoreCard from '../components/domain/StoreCard';
import { useT } from '../i18n';
export default function StorePage() {
  const { storeId = '' } = useParams();
  const state = usePublicStore(storeId);
  const t = useT();
  return (
    <Resource state={state}>
      {state.data && (
        <>
          <h1>{state.data.store.name}</h1>
          <p>
            {t('hoursPrefix')}
            {state.data.store.hours.open}–{state.data.store.hours.close}
          </p>
          <h2>{t('sells')}</h2>
          <div className="chips">
            {state.data.items.map((i) => (
              <span className="item-chip" key={i.item_id}>
                {i.name}
              </span>
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
