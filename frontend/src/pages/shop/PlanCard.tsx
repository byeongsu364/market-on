import { Link } from 'react-router-dom';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useT } from '../../i18n';
import { ChipLink, ChipRow } from '../../components/common/Chip';
import { ItemTile } from '../../components/common/parts';
import ModelLabel from '../../components/domain/ModelLabel';
import { formatPrice } from '../../utils/formatPrice';
import type { RecommendResponse } from '../../types/contract';
import s from './shop.module.css';

/** 장바구니 대화에서 도우미가 보여 주는 구성(품목·수량·합계·근거·모델) */
export default function PlanCard({ plan, id }: { plan: RecommendResponse; id: string }) {
  const t = useT();
  const ctx = useShoppingContext();
  return (
    <section className={s.plan} aria-labelledby={id}>
      <div className={s.planHead}>
        <div>
          <h2 className={s.h2} id={id}>
            {t('shopPlanTitle')}
          </h2>
          <span className={s.sub}>
            {plan.left >= 0
              ? t('shopWithinBudget').replace('{budget}', formatPrice(plan.budget))
              : t('shopOverBudget').replace('{amount}', formatPrice(-plan.left))}
          </span>
        </div>
        <span className={s.total}>{formatPrice(plan.total)}</span>
      </div>
      <div>
        {plan.items.map((i) => (
          <article className={s.line} key={i.item_id} aria-labelledby={`${id}-${i.item_id}`}>
            <ItemTile itemId={i.item_id} />
            <div className={s.lineBody}>
              <h3 className={s.lineName} id={`${id}-${i.item_id}`}>
                {i.name}
              </h3>
              <span className={s.sub}>{i.reason}</span>
              <span className={s.note}>
                {i.sources.map((src, n) => (
                  <span key={n}>
                    {n > 0 && ', '}
                    {src.url ? (
                      <a
                        className="prose-link"
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {src.title}
                      </a>
                    ) : (
                      src.title
                    )}
                    {src.publisher && ` (${src.publisher})`}
                    {src.draft && ` ${t('askDraft')}`}
                  </span>
                ))}
              </span>
              {i.stores.length > 0 && (
                <ChipRow label={t('shopStoresFor').replace('{item}', i.name)}>
                  {i.stores.map((st) => (
                    <ChipLink
                      key={st.store_id}
                      to={ctx.href('/', { item: i.item_id, store: st.store_id })}
                    >
                      {st.name}
                    </ChipLink>
                  ))}
                </ChipRow>
              )}
              <Link className="text-link" to={ctx.href('/', { item: i.item_id })}>
                {t('viewStores')}
              </Link>
            </div>
            <span className={s.qty}>
              {i.quantity}
              {i.unit_label}
              {i.subtotal == null && <span className={s.note}> {t('shopNoPrice')}</span>}
            </span>
          </article>
        ))}
      </div>
      <p className={s.note}>{plan.note}</p>
      <ModelLabel model={plan.model} />
    </section>
  );
}
