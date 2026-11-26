import Recipes from '../../components/domain/Recipes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { recommend } from '../../api/recommend';
import { useAction } from '../../hooks/useResource';
import { useRequireMarket } from '../../hooks/useFlows';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import Button, { ButtonLink } from '../../components/common/Button';
import { Chip, ChipLink, ChipRow } from '../../components/common/Chip';
import ErrorBox from '../../components/common/ErrorBox';
import Icon from '../../components/common/Icon';
import Loading from '../../components/common/Loading';
import { Field, IconButton, ItemTile, Stepper } from '../../components/common/parts';
import ModelLabel from '../../components/domain/ModelLabel';
import { formatPrice } from '../../utils/formatPrice';
import type { RecommendRequest } from '../../types/contract';
import { RouteList, RouteMap } from './route';
import { routeHref, useShopRoute, type RouteState } from '../../hooks/useShopRoute';
import s from './shop.module.css';

const PURPOSES: RecommendRequest['purpose'][] = ['집밥', '선물', '모임'];

/** 장보기(/shop). PC는 왼쪽 패널(조건, 구성, 동선)과 오른쪽 동선 지도(WebShop) */
export default function Shop() {
  const t = useT();
  const ctx = useShoppingContext();
  const desktop = useIsDesktop();
  const [purpose, setPurpose] = useState<RecommendRequest['purpose']>('집밥');
  const [headcount, setHeadcount] = useState(2);
  const [budget, setBudget] = useState('20000');
  const action = useAction(recommend);
  const ready = useRequireMarket();
  const plan = action.data;
  const itemIds = plan?.items.map((i) => i.item_id) ?? [];
  const lines = plan?.items.map(({ item_id, name, quantity, unit_label }) => ({
    item_id,
    name,
    quantity,
    unit_label,
  }));
  const route = useShopRoute(desktop && plan ? (ctx.marketId ?? '') : '', itemIds, lines);
  if (!ready) return null;
  const budgetValue = Number(budget);
  const submit = () =>
    ctx.marketId &&
    budgetValue > 0 &&
    void action.run({
      purpose,
      relation: '가족',
      budget: budgetValue,
      headcount,
      market_id: ctx.marketId,
    });
  const state: RouteState | undefined = plan
    ? { lines, total: plan.total, budget: plan.budget }
    : undefined;
  const toRoute = routeHref(ctx.href('/shop/route'), itemIds);

  const panel = (
    <>
      <div className={s.head}>
        <h1 className={s.h1}>{t('shopTitle')}</h1>
        {!desktop && <IconButton icon="user" label={t('shopMe')} round to="/me" />}
      </div>
      <p className={s.lead}>{t('shopLead')}</p>
      <Recipes />
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={s.group}>
          <span className={s.label} id="shop-purpose">
            {t('purpose')}
          </span>
          <ChipRow wrap label={t('purpose')}>
            {PURPOSES.map((p) => (
              <Chip key={p} pressed={purpose === p} onClick={() => setPurpose(p)}>
                {p}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <div className={s.twoCols}>
          <div className={s.stepperField}>
            <span className={s.fieldLabel}>{t('headcount')}</span>
            <Stepper
              label={t('headcount')}
              value={headcount}
              onChange={setHeadcount}
              min={1}
              max={20}
              format={(v) => `${v}명`}
            />
          </div>
          <Field
            label={t('budget')}
            type="text"
            inputMode="numeric"
            value={budgetValue ? budgetValue.toLocaleString('ko-KR') : ''}
            suffix="원"
            onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
          />
        </div>
        <Button
          type="submit"
          variant={plan ? 'surface' : 'primary'}
          wide
          loading={action.loading}
          disabled={!budgetValue}
        >
          {plan ? t('shopRecompose') : t('viewComposition')}
        </Button>
      </form>
      {action.error && <ErrorBox message={action.error} />}
      <div aria-live="polite">{action.loading && <Loading message={t('shopComposing')} />}</div>
      {plan && (
        <>
          <section className={s.plan} aria-labelledby="plan-title">
            <div className={s.planHead}>
              <div>
                <h2 className={s.h2} id="plan-title">
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
                <article className={s.line} key={i.item_id} aria-labelledby={`line-${i.item_id}`}>
                  <ItemTile itemId={i.item_id} />
                  <div className={s.lineBody}>
                    <h3 className={s.lineName} id={`line-${i.item_id}`}>
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
          {plan.items.length > 0 && (
            <div className={s.actions}>
              {!desktop && (
                <ButtonLink
                  variant="primary"
                  wide
                  to={toRoute}
                  state={state}
                  icon={<Icon name="map" size={20} />}
                >
                  {t('shopOnMap')}
                </ButtonLink>
              )}
              <ButtonLink wide to={ctx.href('/chat')}>
                {t('shopChat')}
              </ButtonLink>
            </div>
          )}
          {desktop && plan.items.length > 0 && (
            <RouteList route={route} lines={lines} total={plan.total} />
          )}
        </>
      )}
    </>
  );

  if (!desktop) return <div className={s.page}>{panel}</div>;
  return (
    <div className={s.web}>
      <div className={s.webPanel}>{panel}</div>
      <section className={s.webMap} aria-label={t('shopRouteMap')}>
        {plan && route.located ? (
          <RouteMap route={route} label={t('shopRouteMap')} />
        ) : (
          <div className={`${s.webMap} ${s.webMapEmpty}`}>
            <p>{plan ? t('shopRouteNoLocation') : t('shopMapEmpty')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
