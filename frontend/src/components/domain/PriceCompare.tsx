import { useT } from '../../i18n';
import type { Price } from '../../types/contract';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { unitLabel } from '../../utils/convertUnit';
// 서버의 대체 규칙 코드를 손님이 읽을 수 있는 말로
const FALLBACK_LABELS: Record<string, string> = {
  region_avg: '같은 지역 전체 평균',
  national_avg: '전국 평균',
  last_valid: '최근 조사값',
};

export default function PriceCompare({
  price,
  onVarietyChange,
}: {
  price: Price;
  onVarietyChange?: (id: string) => void;
}) {
  const t = useT();
  const pct = price.diff_pct;
  return (
    <section aria-live="polite">
      {price.varieties?.length >= 2 && (
        <>
          <div className="chips" aria-label="품종">
            {price.varieties.map((v) => (
              <button
                type="button"
                className="chip"
                key={v.variety_id}
                aria-pressed={price.variety_id === v.variety_id}
                onClick={() => onVarietyChange?.(v.variety_id)}
              >
                {v.name} ·{' '}
                {v.reference_price === null ? '시세 없음' : formatPrice(v.reference_price)} ·{' '}
                {/* 전통시장 조사가 없으면 다른 값(대형유통 등)으로 대체한 것 — "0곳"으로 보이지 않게 */}
                {v.count > 0 ? `전통시장 ${v.count}곳` : '대체값'}
              </button>
            ))}
          </div>
          <p className="caption">품종은 가격표나 상인에게 확인해 주세요</p>
        </>
      )}
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
          이 시장 aT 조사값 · {price.this_market.name} {formatPrice(price.this_market.price)}
        </p>
      )}
      <p className="caption">
        {price.source}
        <br />
        {price.region} · {formatDate(price.observed_on)}
        {t('fallbackCaption')}
        {FALLBACK_LABELS[price.fallback ?? ''] ?? price.fallback ?? '사용 안 함'}
      </p>
    </section>
  );
}
