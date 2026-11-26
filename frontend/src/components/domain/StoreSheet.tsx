import StoreReviews from './StoreReviews';
import { useT } from '../../i18n';
import { useEffect, useRef } from 'react';
import type { Store } from '../../types/contract';
import { useActiveSales } from '../../hooks/useSales';
import { useItemCatalog } from '../../hooks/useFlows';
import StorePriceDisplay from './StorePriceDisplay';
import StoreCard from './StoreCard';
import Resource from '../common/Resource';
export default function StoreSheet({
  store,
  zone,
  onClose,
  trigger,
}: {
  store: Store;
  zone: string;
  onClose: () => void;
  trigger: Element | null;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const catalog = useItemCatalog();
  const sales = useActiveSales();
  useEffect(() => {
    const previous = trigger;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,a,input,textarea,select,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = old;
      (previous as HTMLElement | null)?.focus();
    };
  }, [onClose, trigger]);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-title"
      >
        <button className="secondary close" onClick={onClose}>
          {t('close')}
        </button>
        <h2 id="store-title">{store.name}</h2>
        {store.source === 'sbiz' && <p className="caption">공공데이터 상호명</p>}
        <p>{zone}</p>
        {store.highlight && <StorePriceDisplay price={store.price} />}
        <StoreReviews key={store.store_id} storeId={store.store_id} />
        <h3>{t('sells')}</h3>
        <Resource state={catalog}>
          <div className="chips">
            {store.sells.map((id) => (
              <span className="item-chip" key={id}>
                {catalog.data?.find((i) => i.item_id === id)?.name ?? id}
                {store.guessed_item_ids.includes(id) && <small>업종 기준 · 상인 확인 전</small>}
              </span>
            ))}
          </div>
        </Resource>
        <p>
          {t('hoursPrefix')}
          {store.hours}
        </p>
        {sales.data
          ?.filter((s) => s.store_id === store.store_id)
          .map((s) => (
            <StoreCard key={s.id} sale={s} />
          ))}
      </div>
    </div>
  );
}
