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
  if (price.source === 'market_avg') {
    const date = price.observed_on?.split('-');
    return (
      t('reviewMarketAverage') +
      (date ? fill(t('reviewSurvey'), { month: Number(date[1]), day: Number(date[2]) }) : '')
    );
  }
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
  if (
    !store.price ||
    store.price.source === 'market_avg' ||
    !price ||
    price.fallback ||
    store.price.unit !== price.unit
  )
    return null;
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

/**
 * 위치를 확인하지 않은 점포의 예시 핀 자리(2026-11-27, 시안 MarketInside처럼 실제 지도에 점포별 핀).
 * 공공데이터 좌표는 건물 하나의 위치라(경동 108곳 중 101곳이 같은 점) 쓰지 않고, 시장 중심 둘레에
 * 업종별 묶음으로 모아 고정된 자리에 둠. 화면에는 "핀 위치는 예시"를 표시하고 거리 계산에는 쓰지 않음.
 */
export function examplePositions(
  views: StoreView[],
  center: { lat: number; lng: number },
): Map<string, { lat: number; lng: number }> {
  const M_LAT = 1 / 111000;
  const M_LNG = 1 / (111000 * Math.cos((center.lat * Math.PI) / 180));
  const groups = new Map<string, StoreView[]>();
  for (const v of views) {
    if (v.store.lat != null && v.store.lng != null) continue;
    const key = v.category ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  // 묶음 자리: 3열 2행, 동서 80m·남북 70m 간격. 큰 묶음부터 가운데 줄에
  const slots: [number, number][] = [
    [0, 35],
    [-80, 35],
    [80, 35],
    [0, -35],
    [-80, -35],
    [80, -35],
    [160, 0],
    [-160, 0],
  ];
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const out = new Map<string, { lat: number; lng: number }>();
  ordered.forEach(([, list], gi) => {
    const [cx, cy] = slots[gi % slots.length];
    const cols = Math.ceil(Math.sqrt(list.length * 1.4));
    const rows = Math.ceil(list.length / cols);
    const gap = 9; // m
    list.forEach((v, i) => {
      const east = cx + ((i % cols) - (cols - 1) / 2) * gap;
      const north = cy - (Math.floor(i / cols) - (rows - 1) / 2) * gap;
      out.set(v.store.store_id, {
        lat: +(center.lat + north * M_LAT).toFixed(6),
        lng: +(center.lng + east * M_LNG).toFixed(6),
      });
    });
  });
  return out;
}
