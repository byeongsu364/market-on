import type { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { walkMinutes } from '../../utils/directions';
import { CATEGORY_LABELS } from '../../utils/category';
import { bandOf } from '../../utils/priceBand';
import { diffPct } from '../../utils/diffPct';
import { priceTime } from '../../utils/priceTime';
import type { Price, PriceBand, Store, StoreCategory } from '../../types/contract';

// 지도 화면들이 함께 쓰는 계산(컴포넌트 파일과 나눠 둠)

export type StoreView = {
  store: Store;
  category: StoreCategory | null;
  /** 손님 위치에서 거리(m). 모르면 null */
  distance: number | null;
};

/** 점포의 둘째 줄: 카테고리, 걸어서 N분, 영업 중 */
export function storeSub(v: StoreView, t: ReturnType<typeof useT>, withCategory = true) {
  const parts: string[] = [];
  if (withCategory && v.category) parts.push(CATEGORY_LABELS[v.category]);
  if (v.distance !== null && v.distance <= 3000)
    parts.push(fill(t('mapWalk'), { minutes: walkMinutes(v.distance) }));
  if (v.store.open_now === true) parts.push(t('mapOpenNow'));
  return parts.join(', ');
}

/** 가격 시각(손님 N명이 오늘 14:20에 확인) */
export function priceWho(price: NonNullable<Store['price']>, t: ReturnType<typeof useT>) {
  return price.source === 'merchant'
    ? fill(t('mapMerchantCheckedAt'), { time: priceTime(price.latest_at) })
    : fill(t('mapCustomersCheckedAt'), {
        count: price.reporters,
        time: priceTime(price.latest_at),
      });
}

/** 점포 가격을 기준시세(고른 품종)와 견준 구간. 단위가 다르거나 기준이 없거나 대체값이면 null */
export function storeBand(
  store: Store,
  price: Price | null | undefined,
  varietyId?: string,
): PriceBand | null {
  if (!store.price || !price || price.fallback || store.price.unit !== price.unit) return null;
  const variety = price.varieties.find((v) => v.variety_id === (varietyId ?? price.variety_id));
  const reference = variety ? variety.reference_price : price.reference_price;
  if (reference == null) return null;
  return bandOf(diffPct(store.price.price, reference));
}

/** "사과 2,300원" → 이름 "사과", 가격 2300. 가격은 10원~1천만 원 정수만 */
export function parseSearch(text: string) {
  const m = text.match(/(\d[\d,]*)\s*원?/);
  const price = m ? Number(m[1].replace(/,/g, '')) : NaN;
  const name = text.replace(/(\d[\d,]*)\s*원?/, '').trim();
  return {
    name,
    price: Number.isInteger(price) && price >= 10 && price <= 10000000 ? price : null,
  };
}
