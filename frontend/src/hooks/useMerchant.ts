import { useCallback, useState } from 'react';
import type { PaymentMethod } from '../types/contract';
import * as api from '../api/merchant';
import { getPending, decide } from '../api/admin';
import { useResource, useAction } from './useResource';
import { useItemCatalog } from './useFlows';
import { getVarieties } from '../api/items';
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
  // 030: 단골 수·오늘 품절·가게 위치(mock만, live는 null)
  const extras = useResource(api.getExtras);
  const soldOut = useAction(async (item: string, out: boolean) => {
    await api.setSoldOut(item, out);
    extras.retry();
    return true;
  });
  return { store, active, ended, action, extras, soldOut };
}
export function useSaleNew() {
  const store = useResource(api.getStore);
  const catalog = useItemCatalog();
  const [item, setItem] = useState('');
  const [variety, setVariety] = useState('');
  const varieties = useResource(
    useCallback(() => (item ? getVarieties(item) : Promise.resolve([])), [item]),
  );
  const [price, setPrice] = useState('');
  const [regular, setRegular] = useState('');
  const [unit, setUnit] = useState('');
  const [duration, setDuration] = useState(1);
  const extras = useResource(api.getExtras);
  const endsAt = saleEnd(duration, store.data?.hours.close);
  const action = useAction(api.createSale);
  const submit = () =>
    action.run({
      item_id: item,
      variety_id: varieties.data?.some((v) => v.variety_id === variety) ? variety : null,
      sale_price: Number(price),
      ...(regular ? { regular_price: Number(regular) } : {}),
      ...(unit ? { unit_id: unit } : {}),
      ends_at: endsAt,
    });
  return {
    store,
    catalog,
    item,
    setItem,
    variety,
    setVariety,
    varieties,
    price,
    setPrice,
    regular,
    setRegular,
    unit,
    setUnit,
    extras,
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
  const [varieties, setVarieties] = useState<Record<string, string[]> | null>(null);
  const varietyValue = varieties ?? store.data?.varieties ?? {};
  const [hours, setHours] = useState<{ open: string; close: string } | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [payments, setPayments] = useState<PaymentMethod[] | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  const paymentValue = payments ?? store.data?.payments ?? [];
  const introValue = intro ?? store.data?.intro ?? '';
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
    varietyValue,
    setVarieties,
    value,
    action,
    setHours,
    paymentValue,
    setPayments,
    introValue,
    setIntro,
    toggle: (id: string) =>
      setSelected(chosen.includes(id) ? chosen.filter((i) => i !== id) : [...chosen, id]),
    save: () =>
      action.run({
        hours: value,
        item_ids: chosen,
        payments: paymentValue,
        intro: introValue,
        varieties: Object.fromEntries(
          Object.entries(varietyValue).filter(([id]) => chosen.includes(id)),
        ),
      }),
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
