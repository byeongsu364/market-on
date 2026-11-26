import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { postPriceReport } from '../api/priceReports';
import { useSession } from '../store/session';
import { useShoppingContext } from './useShoppingContext';
import { useItem } from './useItem';
import { usePrice } from './usePrice';
import { useMarketMap } from './useMarketMap';
import { priceBand } from '../utils/priceBand';

/** 찍기·직접 입력에서 결과로 넘기는 이동 상태(주소에 넣지 않는 값) */
export type ResultNavState = {
  /** 현장 가격(수량 전체) */
  price?: number;
  quantity?: number;
  photo?: File;
  labels?: string[];
  method?: 'manual' | 'price_tag_photo';
  media_id?: string | null;
  /** 품종을 어디서 정했는지: 가격표 글자 또는 손님 선택(사진 모양으로 짐작하지 않음) */
  varietyFrom?: 'tag' | 'choice';
};

/** 지금 맥락의 점포 id: 주소가 이기고, 없으면 점포 QR로 들어온 세션 맥락 */
export function useStoreId() {
  const ctx = useShoppingContext();
  const { storeContext } = useSession();
  return (
    ctx.storeId ??
    (storeContext && storeContext.market_id === ctx.marketId ? storeContext.store_id : undefined)
  );
}

/**
 * 결과 화면(/items/:itemId)의 상태. 품종·단위·점포·시장은 주소 쿼리, 가격·수량은 이동 상태.
 * 주소만으로 열어도(새로고침, 공유 링크) 품종과 단위가 복원됨.
 */
export function useResult() {
  const { itemId = '' } = useParams();
  const ctx = useShoppingContext();
  const location = useLocation();
  const session = useSession();
  const nav = (location.state ?? {}) as ResultNavState;
  const item = useItem(itemId);
  const [value, setValue] = useState(nav.price ? String(nav.price) : '');
  const quantity = nav.quantity && nav.quantity > 0 ? nav.quantity : 1;
  const units = item.data?.units;
  const unit =
    ctx.unit && (!units || units.includes(ctx.unit)) ? ctx.unit : (item.data?.default_unit ?? '');
  const marketId = ctx.marketId ?? '';
  const storeId = useStoreId();
  const seen = Number(value) > 0 ? Number(value) / quantity : undefined;
  const price = usePrice({
    item_id: itemId,
    variety_id: ctx.varietyId,
    market_id: marketId,
    unit,
    seen_price: seen,
  });
  const map = useMarketMap(marketId, itemId, unit);
  // 고른 품종의 응답이 왔을 때만 결론을 냄(품종을 바꾸는 동안 이전 품종 값이 섞이지 않게)
  const data = price.data;
  const current =
    data && (!ctx.varietyId || !data.varieties.length || data.variety_id === ctx.varietyId)
      ? data
      : null;
  const varietyId = ctx.varietyId ?? current?.variety_id ?? undefined;
  const verdict = useMemo(
    () => (current && seen ? priceBand(current, varietyId) : null),
    [current, seen, varietyId],
  );

  // 가격 제보: 결과에 들어올 때 한 번, 점포를 고르면 그 점포로 한 번 더(지시서 009)
  const submitted = useRef(new Set<string>());
  useEffect(() => {
    if (!marketId || !item.data || !unit || !nav.method) return;
    if (!Number.isInteger(Number(value)) || Number(value) < 10 || Number(value) > 10000000) return;
    if (nav.method === 'price_tag_photo' && !nav.media_id) return;
    const key = storeId ?? 'market';
    if (submitted.current.has(key)) return;
    submitted.current.add(key);
    void postPriceReport({
      item_id: itemId,
      market_id: marketId,
      unit,
      price: Number(value),
      quantity,
      method: nav.method,
      ...(nav.media_id ? { media_id: nav.media_id } : {}),
      ...(storeId ? { store_id: storeId } : {}),
    }).catch((error) => console.info('가격 제보를 저장하지 못했어요', error));
  }, [marketId, item.data, unit, value, nav.method, nav.media_id, quantity, itemId, storeId]);

  // 주소의 시장은 PageLayout이 세션에 맞춰 줌. 이름은 세션 시장에서 가져옴
  const market = session.market;
  return {
    itemId,
    item,
    marketId,
    market,
    unit,
    quantity,
    value,
    setValue,
    seen,
    price,
    current,
    varietyId,
    varietyChosen: !!ctx.varietyId,
    varietyFrom: nav.varietyFrom,
    verdict,
    map,
    storeId,
    nav,
    ctx,
    setVariety: (id: string) => ctx.update({ variety: id }, true),
    setUnit: (u: string) => ctx.update({ unit: u }, true),
    setStoreId: (id: string | null) => ctx.update({ store: id }, true),
  };
}
