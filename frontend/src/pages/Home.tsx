import { Link } from 'react-router-dom';
import { useSession } from '../store/session';
import { useT } from '../i18n';
import { useItemCatalog } from '../hooks/useFlows';
import { useActiveSales } from '../hooks/useSales';
import { usePrice } from '../hooks/usePrice';
import Resource from '../components/common/Resource';
import StoreCard from '../components/domain/StoreCard';
import { formatPrice } from '../utils/formatPrice';
import type { Item } from '../types/contract';
import { unitLabel } from '../utils/convertUnit';
function PriceTag({ item }: { item: Item }) {
  const { market } = useSession();
  const price = usePrice({
    item_id: item.item_id,
    market_id: market?.market_id ?? 'market:demo',
    unit: item.default_unit,
  });
  return (
    <article className="price-tag">
      <Link to={`/items/${encodeURIComponent(item.item_id)}`}>{item.name}</Link>
      <Resource state={price}>
        {price.data && (
          <>
            <strong className="big-number">{formatPrice(price.data.reference_price)}</strong>
            <span> / {unitLabel(price.data.unit)}</span>
            <small>{price.data.source}</small>
          </>
        )}
      </Resource>
    </article>
  );
}
export default function Home() {
  const { market } = useSession();
  const t = useT();
  const catalog = useItemCatalog();
  const sales = useActiveSales(market?.market_id ?? 'market:demo');
  return (
    <>
      <Link className="market-bar" to="/markets" state={{ from: '/' }}>
        <span className="awning" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        {t('market')} · {market?.name ?? t('chooseMarket')}{' '}
        <span className="market-arrow" aria-hidden="true">
          ›
        </span>
      </Link>
      <section className="scan-hero">
        <h1>
          {t('homeHeadlineFirst')}
          <br />
          {t('homeHeadlineSecond')}
        </h1>
        <Link
          className="button scan-button"
          to={market ? '/scan' : '/markets'}
          state={{ from: '/scan' }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M3 7h5l2-3h4l2 3h5v13H3Z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {t('scan')}
        </Link>
      </section>
      <section>
        <h2>{t('prices')}</h2>
        <Resource state={catalog}>
          {catalog.data?.slice(0, 3).map((i) => (
            <PriceTag key={i.item_id} item={i} />
          ))}
        </Resource>
      </section>
      {!!sales.data?.length && (
        <section>
          <h2>{t('closingSales')}</h2>
          {sales.data.map((s) => (
            <StoreCard key={s.id} sale={s} />
          ))}
        </section>
      )}
    </>
  );
}
