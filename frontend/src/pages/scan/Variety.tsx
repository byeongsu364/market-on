import { Link, useLocation, useParams } from 'react-router-dom';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useItem } from '../../hooks/useItem';
import { usePrice } from '../../hooks/usePrice';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import type { ResultNavState } from '../../hooks/useResult';
import { useT } from '../../i18n';
import AppHeader from '../../components/layout/AppHeader';
import Resource from '../../components/common/Resource';
import { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { ItemTile } from '../../components/common/parts';
import { formatPrice } from '../../utils/formatPrice';
import { unitLabel } from '../../utils/convertUnit';
import { euro, josa } from '../../utils/josa';
import { BandCell, PriceHistoryChart } from './resultParts';
import { varietyBand } from '../../utils/varietyBand';
import type { VarietyPrice } from '../../types/contract';
import s from './result.module.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 수확 시기: 온톨로지 harvestPeriod 값만. 없으면 "정보가 아직 없어요" */
function Harvest({ v }: { v: VarietyPrice }) {
  const t = useT();
  const from = v.harvest?.from ? Number(v.harvest.from) : null;
  return (
    <div className={s.group} style={{ gap: 6 }}>
      <div className={s.harvestHead}>
        <span className={s.harvestLabel}>{t('scanHarvest')}</span>
        {v.harvest?.label ? (
          <span className={s.harvestValue}>{v.harvest.label}</span>
        ) : (
          <span className={s.bandOff}>{t('scanNoInfo')}</span>
        )}
      </div>
      {from && (
        <div
          className={s.months}
          role="img"
          aria-label={t('scanHarvestStart').replace('{month}', String(from))}
        >
          {MONTHS.map((m) => (
            <span key={m} className={s.month} data-on={m === from}>
              <span />
              <span>{m}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 품종 견줘 보기(/items/:itemId/varieties). 설명과 수확 시기는 mock·API 필드에서만, 없으면 비움 */
export default function Variety() {
  const t = useT();
  const { itemId = '' } = useParams();
  const ctx = useShoppingContext();
  const location = useLocation();
  const desktop = useIsDesktop();
  const nav = (location.state ?? {}) as ResultNavState;
  const item = useItem(itemId);
  const unit = ctx.unit ?? item.data?.default_unit ?? '';
  const price = usePrice({ item_id: itemId, market_id: ctx.marketId ?? '', unit });
  const seen = nav.price ? nav.price / (nav.quantity || 1) : undefined;
  const varieties = price.data?.varieties ?? [];
  const chosen = varieties.find((v) => v.variety_id === ctx.varietyId) ?? varieties[0];
  const resultHref = (variety?: string) =>
    ctx.href(`/items/${encodeURIComponent(itemId)}`, {
      variety: variety ?? ctx.varietyId ?? null,
      unit: ctx.unit ?? null,
      store: ctx.storeId ?? null,
    });
  const name = item.data?.name ?? '';
  const sources = [
    ...new Set(varieties.map((v) => v.description_source).filter((x): x is string => !!x)),
  ];
  return (
    <>
      {!desktop && <AppHeader />}
      <Resource state={item}>
        <div className={s.varietyPage}>
          {desktop && (
            <Link className={s.smallLink} to={resultHref()} state={nav}>
              <Icon name="back" size={18} />
              {t('scanBackToResult').replace('{item}', name)}
            </Link>
          )}
          <div className={s.varietyIntro}>
            <h1 className={s.title}>{t('scanVarietyTitle').replace('{item}', name)}</h1>
            <p className={s.lead}>
              {t('scanVarietyLead').replace('{item}', name ? josa(name, '이라도', '라도') : '')}
            </p>
          </div>
          <Resource state={price}>
            {varieties.length < 2 ? (
              <p className={s.empty}>{t('scanNoVarieties')}</p>
            ) : (
              <div className={s.varieties}>
                {varieties.map((v) => (
                  <article className={s.variety} key={v.variety_id} aria-labelledby={v.variety_id}>
                    <div className={s.varietyHead}>
                      <ItemTile itemId={itemId} varietyId={v.variety_id} size={56} />
                      <div className={s.headBody}>
                        <h2 className={s.varietyName} id={v.variety_id}>
                          {v.name}
                        </h2>
                        <span className={s.sub}>
                          {v.mock && <small>예시 · </small>}
                          {v.reference_price == null
                            ? t('scanNoReferenceYet')
                            : `${t('scanReference')} ${unitLabel(v.unit)} ${formatPrice(v.reference_price)}`}
                        </span>
                      </div>
                    </div>
                    {v.mock && <p className={s.note}>예시 시세 · 실제 조사값 아님</p>}
                    {v.description && <p className={s.body}>{v.description}</p>}
                    {v.harvest && <Harvest v={v} />}
                    <PriceHistoryChart
                      itemId={itemId}
                      varietyId={v.variety_id}
                      varietyName={v.name}
                      unit={v.unit}
                      marketId={ctx.marketId ?? undefined}
                    />
                    {seen && (
                      <div className={s.ifRow}>
                        <span>{t('scanIfPrice').replace('{price}', formatPrice(seen))}</span>
                        <BandCell band={varietyBand(seen, v.reference_price, price.data!)} />
                      </div>
                    )}
                    {desktop && (
                      <ButtonLink
                        size="md"
                        to={ctx.href('/', { item: itemId, variety: v.variety_id })}
                      >
                        {t('scanVarietyStores')}
                      </ButtonLink>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Resource>
          <p className={`${s.note} ${s.ruled}`}>
            {t('scanVarietyFooter')}
            {sources.length > 0 &&
              ` ${t('scanVarietySource').replace('{source}', sources.join(', '))}`}
          </p>
          {chosen && (
            <div className={s.actions}>
              <div className={s.actionsInner}>
                <ButtonLink variant="primary" wide to={resultHref(chosen.variety_id)} state={nav}>
                  {t('scanResultWith').replace('{name}', euro(chosen.name))}
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      </Resource>
    </>
  );
}
