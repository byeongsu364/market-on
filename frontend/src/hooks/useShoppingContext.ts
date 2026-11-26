import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../store/session';

// 화면 사이에 들고 다니는 "장보기 맥락"(지시서 030 4장).
// 시장·점포·품목·품종·단위는 주소 쿼리(market, store, item, variety, unit)로 넘기고,
// 가격과 수량만 화면 이동 상태(location.state)에 둠. 주소에 값이 있으면 주소가 이기고,
// 없을 때만 store/session.ts의 시장 자동 선택을 씀.
export type ShoppingKey = 'market' | 'store' | 'item' | 'variety' | 'unit';
export const SHOPPING_KEYS: ShoppingKey[] = ['market', 'store', 'item', 'variety', 'unit'];
export type ShoppingValues = Partial<Record<ShoppingKey, string | null>>;
export type ShoppingState = { price?: number; quantity?: number };

/** 경로와 맥락 값으로 주소 만들기. null은 지움, undefined는 건드리지 않음 */
export function shoppingHref(
  pathname: string,
  values: ShoppingValues,
  base?: URLSearchParams,
  extra?: Record<string, string | null | undefined>,
) {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries({ ...values, ...extra })) {
    if (value === null || value === '') next.delete(key);
    else if (value !== undefined) next.set(key, value);
  }
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function useShoppingContext() {
  const [params, setParams] = useSearchParams();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const fromUrl = (key: ShoppingKey) => params.get(key) ?? undefined;
  const marketId = fromUrl('market') ?? session.market?.market_id;
  const state = (location.state ?? {}) as ShoppingState;

  /** 이 화면의 쿼리만 바꿈(기록을 남기지 않으려면 replace) */
  const update = useCallback(
    (values: ShoppingValues & Record<string, string | null | undefined>, replace = false) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === '') next.delete(key);
        else if (value !== undefined) next.set(key, value);
      }
      setParams(next, { replace, state: location.state });
    },
    [params, setParams, location.state],
  );

  /** 다른 화면으로 갈 때 맥락을 이어 붙인 주소. 시장은 지금 값(주소 또는 세션)을 기본으로 넣음 */
  const href = useCallback(
    (
      pathname: string,
      values: ShoppingValues = {},
      extra?: Record<string, string | null | undefined>,
    ) =>
      shoppingHref(pathname, { market: marketId ?? null, ...values }, new URLSearchParams(), extra),
    [marketId],
  );

  const go = useCallback(
    (pathname: string, values: ShoppingValues = {}, state?: ShoppingState) =>
      navigate(href(pathname, values), { state }),
    [navigate, href],
  );

  return useMemo(
    () => ({
      marketId,
      market: session.market && session.market.market_id === marketId ? session.market : null,
      storeId: fromUrl('store'),
      itemId: fromUrl('item'),
      varietyId: fromUrl('variety'),
      unit: fromUrl('unit'),
      price: state.price,
      quantity: state.quantity,
      params,
      update,
      href,
      go,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, marketId, session.market, state.price, state.quantity, update, href, go],
  );
}
