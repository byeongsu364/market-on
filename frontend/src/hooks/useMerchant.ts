import { useCallback, useState } from 'react';
import * as api from '../api/merchant';
import { getPending, decide } from '../api/admin';
import { useResource, useAction } from './useResource';
import { useItemCatalog } from './useFlows';
import { saleEnd } from '../utils/sale';
export function useMerchantHome() {
  const store = useResource(api.getStore);
  const active = useResource(useCallback(() => api.getSales('active'), []));
  const ended = useResource(useCallback(() => api.getSales('ended'), []));
  const action = useAction(async (id: number, repost = false) => {
    if (repost) await api.repostSale(id, saleEnd());
    else await api.endSale(id);
    active.retry();
    ended.retry();
    store.retry();
    return true;
  });
  return { store, active, ended, action };
}
export function useSaleNew() {
  const store = useResource(api.getStore);
  const catalog = useItemCatalog();
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [regular, setRegular] = useState('');
  const [duration, setDuration] = useState(1);
  const endsAt = saleEnd(duration, store.data?.hours.close);
  const action = useAction(api.createSale);
  const submit = () =>
    action.run({
      item_id: item,
      sale_price: Number(price),
      ...(regular ? { regular_price: Number(regular) } : {}),
      ends_at: endsAt,
    });
  return {
    store,
    catalog,
    item,
    setItem,
    price,
    setPrice,
    regular,
    setRegular,
    duration,
    setDuration,
    endsAt,
    action,
    submit,
  };
}
export function useStoreEdit() {
  const store = useResource(api.getStore);
  const catalog = useItemCatalog();
  const [hours, setHours] = useState<{ open: string; close: string } | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const chosen = selected ?? store.data?.item_ids ?? [];
  const value = hours ?? {
    open: store.data?.hours.open || '09:00',
    close: store.data?.hours.close || '20:00',
  };
  const action = useAction(api.updateStore);
  return {
    store,
    catalog,
    chosen,
    value,
    action,
    setHours,
    toggle: (id: string) =>
      setSelected(chosen.includes(id) ? chosen.filter((i) => i !== id) : [...chosen, id]),
    save: () => action.run({ hours: value, item_ids: chosen }),
  };
}
export function useAdmin() {
  const pending = useResource(getPending);
  const action = useAction(async (id: string, a: 'approve' | 'reject') => {
    await decide(id, a);
    pending.retry();
    return true;
  });
  return { pending, action };
}
