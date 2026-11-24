import type { StorePrice } from '../../types/contract';
import { unitLabel } from '../../utils/convertUnit';
import { priceTime } from '../../utils/priceTime';
export default function StorePriceDisplay({ price }: { price: StorePrice }) {
  if (!price) return <p className="caption">가격 정보 준비 중</p>;
  return (
    <div className={price.stale ? 'store-price stale' : 'store-price'}>
      <p>
        {price.price.toLocaleString()}원 / {unitLabel(price.unit)}
      </p>
      <small>
        {price.source === 'merchant' ? '상인 확인' : `손님 ${price.reporters}명 확인`}
        {' · '}
        {priceTime(price.latest_at)}
      </small>
      {price.source === 'customers' && price.merchant_confirmed && <small> · 상인 확인</small>}
    </div>
  );
}
