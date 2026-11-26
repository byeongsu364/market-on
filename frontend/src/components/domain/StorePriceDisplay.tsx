import { t } from '../../i18n';
import { fill } from '../../utils/josa';
import s from './priceDisplay.module.css';
import type { StorePrice } from '../../types/contract';
import { unitLabel } from '../../utils/convertUnit';
import { priceTime } from '../../utils/priceTime';
export default function StorePriceDisplay({
  price,
  showConfirmation = true,
}: {
  price: StorePrice;
  showConfirmation?: boolean;
}) {
  if (!price) return <p className="caption">가격 정보 준비 중</p>;
  const marketAvg = price.source === 'market_avg';
  const surveyDate = price.observed_on?.split('-');
  return (
    <div
      className={`${s.price} store-price${price.stale && !marketAvg ? ` ${s.stale} stale` : ''}`}
    >
      <p>
        {price.price.toLocaleString()}원 / {unitLabel(price.unit)}
      </p>
      <small>
        {marketAvg ? (
          <>
            {t('reviewMarketAverage')}
            {surveyDate &&
              fill(t('reviewSurvey'), { month: Number(surveyDate[1]), day: Number(surveyDate[2]) })}
          </>
        ) : (
          <>
            {price.source === 'merchant' ? '상인 확인' : `손님 ${price.reporters}명 확인`}
            {' · '}
            {priceTime(price.latest_at)}
          </>
        )}
      </small>
      {showConfirmation && price.source === 'customers' && price.merchant_confirmed && (
        <small> · 상인 확인</small>
      )}
    </div>
  );
}
