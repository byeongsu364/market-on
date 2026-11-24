import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { searchItems } from '../api/items';
import { recommend } from '../api/recommend';
import { useResource, useAction } from './useResource';
import { useSession } from '../store/session';
import { useCamera } from './useCamera';
import { useRecognize } from './useRecognize';
import { useMarketMap } from './useMarketMap';
import { useItem } from './useItem';
import { usePrice } from './usePrice';
import type { Store } from '../types/contract';
export const useItemCatalog = () => useResource(useCallback(() => searchItems(''), []));
export function useScanFlow() {
  const camera = useCamera();
  const recognition = useRecognize();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const search = useResource(useCallback(() => searchItems(q), [q]));
  const choose = (id: string) =>
    navigate(`/items/${encodeURIComponent(id)}`, {
      state: { labels: recognition.data?.vision_labels ?? [] },
    });
  const run = async () => {
    if (!camera.file) return;
    const result = await recognition.run(camera.file);
    if (result && result.candidates[0]?.confidence >= 0.8)
      navigate(`/items/${encodeURIComponent(result.candidates[0].item_id)}`, {
        state: { labels: result.vision_labels },
      });
  };
  return { camera, recognition, searching, setSearching, q, setQ, search, choose, run };
}
export function useResultFlow() {
  const { itemId = '' } = useParams();
  const { market } = useSession();
  const item = useItem(itemId);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState('');
  const unit = selected || item.data?.default_unit || 'kg';
  const price = usePrice({
    item_id: itemId,
    market_id: market?.market_id ?? 'market:demo',
    unit,
    seen_price: value ? Number(value) : undefined,
  });
  const location = useLocation();
  return {
    item,
    price,
    value,
    setValue,
    unit,
    setSelected,
    labels:
      (
        location.state as {
          labels?: string[];
        } | null
      )?.labels ?? [],
    itemId,
  };
}
export function useMapFlow() {
  const { market } = useSession();
  const [params] = useSearchParams();
  const item = params.get('item') ?? undefined;
  const map = useMarketMap(market?.market_id ?? 'market:demo', item);
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
  const { market } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!market)
      navigate('/markets', { replace: true, state: { from: location.pathname + location.search } });
  }, [market, navigate, location.pathname, location.search]);
  return !!market;
}
