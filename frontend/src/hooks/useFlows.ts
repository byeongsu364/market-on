import { postPriceReport } from '../api/priceReports';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { searchItems } from '../api/items';
import { recommend } from '../api/recommend';
import { useResource, useAction } from './useResource';
import { useSession } from '../store/session';
import { useMarketMap } from './useMarketMap';
import { useItem } from './useItem';
import { usePrice } from './usePrice';
import type { Store } from '../types/contract';
export const useItemCatalog = () => useResource(useCallback(() => searchItems(''), []));
export function useResultFlow() {
  const { itemId = '' } = useParams();
  const { market, storeContext } = useSession();
  const location = useLocation();
  const initial = (location.state ?? {}) as {
    price?: number;
    unit?: string;
    quantity?: number;
    labels?: string[];
    method?: 'manual' | 'price_tag_photo';
    media_id?: string;
  };
  const item = useItem(itemId);
  const [value, setValue] = useState(initial.price ? String(initial.price) : '');
  const [selected, setSelected] = useState(initial.unit ?? '');
  const [storeId, setStoreId] = useState(
    storeContext?.market_id === market?.market_id ? storeContext?.store_id : undefined,
  );
  const unit = selected || item.data?.default_unit || '';
  const price = usePrice({
    item_id: itemId,
    market_id: market?.market_id ?? '',
    unit,
    seen_price: Number(value) > 0 ? Number(value) / (initial.quantity || 1) : undefined,
  });
  const map = useMarketMap(market?.market_id ?? '', itemId, unit);
  const submitted = useRef(new Set<string>());
  useEffect(() => {
    if (
      !market ||
      !item.data ||
      !unit ||
      !initial.method ||
      Number(value) < 10 ||
      Number(value) > 10000000
    )
      return;
    if (initial.method === 'price_tag_photo' && !initial.media_id) return;
    const key = storeId ?? 'market';
    if (submitted.current.has(key)) return;
    submitted.current.add(key);
    void postPriceReport({
      item_id: itemId,
      market_id: market.market_id,
      unit,
      price: Number(value),
      quantity: initial.quantity || 1,
      method: initial.method,
      ...(initial.media_id ? { media_id: initial.media_id } : {}),
      ...(storeId ? { store_id: storeId } : {}),
    }).catch((error) => console.info('가격 제보를 저장하지 못했어요', error));
  }, [
    market,
    item.data,
    unit,
    value,
    initial.method,
    initial.media_id,
    initial.quantity,
    itemId,
    storeId,
  ]);
  return {
    item,
    price,
    value,
    setValue,
    unit,
    setSelected,
    labels: initial.labels ?? [],
    method: initial.method,
    itemId,
    map,
    storeId,
    setStoreId,
    quantity: initial.quantity || 1,
    hasStoreContext: storeContext?.market_id === market?.market_id && !!storeContext,
  };
}
export function useMapFlow() {
  const { market, setStoreContext } = useSession();
  const [params] = useSearchParams();
  const item = params.get('item') ?? undefined;
  const map = useMarketMap(market?.market_id ?? '', item, params.get('unit') ?? undefined);
  const [selected, setSelected] = useState<Store | null>(null);
  const [trigger, setTrigger] = useState<Element | null>(null);
  const close = useCallback(() => setSelected(null), []);
  return {
    item,
    map,
    selected,
    trigger,
    close,
    select: (store: Store, element: Element) => {
      if (market) setStoreContext({ store_id: store.store_id, market_id: market.market_id });
      setSelected(store);
      setTrigger(element);
    },
  };
}
export function useMarketChoice() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  return (market: NonNullable<typeof session.market>) => {
    session.setMarket(market);
    const from = (
      location.state as {
        from?: string;
      } | null
    )?.from;
    navigate(from ?? '/', { replace: true });
  };
}
export function useRecommendFlow() {
  const [purpose, setPurpose] = useState('집밥');
  const [relation, setRelation] = useState('가족');
  const [budget, setBudget] = useState(20000);
  const [headcount, setHeadcount] = useState(2);
  const action = useAction(recommend);
  return {
    purpose,
    setPurpose,
    relation,
    setRelation,
    budget,
    setBudget,
    headcount,
    setHeadcount,
    action,
    submit: () => action.run({ purpose, relation, budget, headcount }),
  };
}
export function useRequireMarket() {
  const { market, marketLoading, unsupported } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!market && !marketLoading && !(unsupported && location.pathname === '/'))
      navigate('/markets', { replace: true, state: { from: location.pathname + location.search } });
  }, [market, marketLoading, unsupported, navigate, location.pathname, location.search]);
  return !!market;
}
