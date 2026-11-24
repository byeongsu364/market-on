import { useT } from '../../i18n';
import type { Price } from '../../types/contract';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { unitLabel } from '../../utils/convertUnit';
export default function PriceCompare({ price }: { price: Price }) {
  const t = useT();
  const pct = price.diff_pct;
  return (
    <section aria-live="polite">
      {pct !== null && (
        <>
          <p className="big-number price-diff">
            <span aria-hidden="true">
              {pct < 0 ? '▼' : pct > 0 ? '▲' : '−'} {Math.abs(pct)}%
            </span>
            <span className="sr-only">
              {t('referenceCompared')}
              {Math.abs(pct)}% {pct < 0 ? '낮아요' : pct > 0 ? '높아요' : '차이가 없어요'}
            </span>
          </p>
          <p>{t('referenceComparison')}</p>
        </>
      )}
      <p>
        {t('referenceValue')}
        {formatPrice(price.reference_price)} / {unitLabel(price.unit)}
      </p>
      {price.by_market_type &&
        Object.entries(price.by_market_type).map(([key, stat]) => (
          <p key={key}>
            {key === 'traditional' ? '전통시장' : '대형유통'}
            {t('averageSuffix')}
            {formatPrice(stat.price)}{' '}
            <small className="inline">
              ({stat.count}
              {t('storeCountSuffix')}
            </small>
          </p>
        ))}
      {price.this_market && (
        <p>
          {price.this_market.name} {formatPrice(price.this_market.price)}
        </p>
      )}
      <p className="caption">
        {price.source}
        <br />
        {price.region} · {formatDate(price.observed_on)}
        {t('fallbackCaption')}
        {price.fallback ?? '사용 안 함'}
      </p>
    </section>
  );
}
