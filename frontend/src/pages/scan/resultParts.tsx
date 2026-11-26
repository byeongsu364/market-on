import { useCallback, useState, useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPriceHistory } from '../../api/price';
import { useResource } from '../../hooks/useResource';
import { useT } from '../../i18n';
import Button from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import {
  CategoryBadge,
  Field,
  ItemTile,
  List,
  ListRow,
  MiniGauge,
  SectionHeader,
} from '../../components/common/parts';
import StorePriceDisplay from '../../components/domain/StorePriceDisplay';
import { bandOf, BAND_LABELS, FALLBACK_LABELS, type PriceVerdict } from '../../utils/priceBand';
import { diffPct } from '../../utils/diffPct';
import { formatPrice } from '../../utils/formatPrice';
import { formatDate } from '../../utils/formatDate';
import { unitLabel } from '../../utils/convertUnit';
import { saleTime } from '../../utils/sale';
import { storeCategory } from '../../utils/category';
import { unitShort, varietyBand } from '../../utils/varietyBand';
import type { Criterion, MarketMap, Price, PriceBand, Store } from '../../types/contract';
import s from './result.module.css';

/** 기준시세 대비 칸 하나(목록용 작은 눈금 + 이름) */
export function BandCell({ band }: { band: PriceBand | null }) {
  const t = useT();
  return band ? (
    <span className={s.bandCell}>
      <MiniGauge band={band} />
      {BAND_LABELS[band - 1]}
    </span>
  ) : (
    <span className={s.bandOff}>{t('scanCannotCompare')}</span>
  );
}

/** 현장 가격과 기준시세 표. 값이 있으면 by_market_type, this_market, 대체 기준 줄을 더함 */
export function PriceTable({
  price,
  verdict,
  seen,
  quantity,
  total,
  unit,
  editing,
  onEdit,
  editor,
}: {
  price: Price | null;
  verdict: PriceVerdict | null;
  seen?: number;
  quantity: number;
  total?: number;
  unit: string;
  editing: boolean;
  onEdit: () => void;
  editor: React.ReactNode;
}) {
  const t = useT();
  const reference = verdict ? verdict.reference : (price?.reference_price ?? null);
  const varietyRef = price?.varieties.find((v) => v.variety_id === price.variety_id);
  const shownRef = varietyRef ? varietyRef.reference_price : reference;
  const diff = verdict?.diff;
  return (
    <div className={s.group}>
      <div className={s.table}>
        <div className={s.tableRow}>
          <span className={s.rowLabel}>{t('price')}</span>
          {seen ? (
            <span className={s.amount}>
              <span className={s.price}>{formatPrice(seen)}</span>
              <span className={s.unit}>{unitShort(unit) && `1${unitShort(unit)}`}</span>
            </span>
          ) : null}
          <Button variant="text" onClick={onEdit} aria-expanded={editing}>
            {seen ? t('scanEdit') : t('scanEnterPrice')}
          </Button>
        </div>
        {editing && <div className={s.editRow}>{editor}</div>}
        {quantity > 1 && total ? (
          <p className={s.note}>
            {t('scanQuantityNote')
              .replace('{total}', formatPrice(total))
              .replace('{quantity}', `${quantity}${unitShort(unit)}`)}
          </p>
        ) : null}
        <div className={s.tableRow}>
          <span className={s.rowLabel}>{t('scanReference')}</span>
          {shownRef != null ? (
            <span className={s.amount}>
              <span className={s.price}>
                {formatPrice(shownRef)} {price?.mock && <small>예시</small>}
              </span>
              <span className={s.unit}>{unitLabel(price?.unit ?? unit)}</span>
            </span>
          ) : (
            <span className={s.empty}>{t('scanNoData')}</span>
          )}
        </div>
        {seen ? (
          <div className={s.tableRow}>
            <span className={s.rowLabel}>{t('scanDiff')}</span>
            {diff != null && shownRef != null ? (
              <span className={s.amount}>
                <span className={s.unit}>{formatPrice(Math.abs(Math.round(seen - shownRef)))}</span>
                <span className={s.diff}>
                  <span aria-hidden="true">
                    {diff < 0 ? '▼' : diff > 0 ? '▲' : '−'} {Math.abs(diff)}%
                  </span>
                  <span className="sr-only">
                    {diff === 0
                      ? t('scanDiffSame')
                      : t(diff < 0 ? 'scanDiffLower' : 'scanDiffHigher').replace(
                          '{pct}',
                          String(Math.abs(diff)),
                        )}
                  </span>
                </span>
              </span>
            ) : (
              <span className={s.empty}>{t('scanCannotCompareLong')}</span>
            )}
          </div>
        ) : null}
        {price?.by_market_type?.traditional && (
          <div className={s.tableRow}>
            <span className={s.rowLabel}>{t('scanTraditionalAvg')}</span>
            <span className={s.amount}>
              <span className={s.priceSm}>
                {formatPrice(price.by_market_type.traditional.price)}
              </span>
              <span className={s.unit}>
                {t('scanStoreCount').replace('{n}', String(price.by_market_type.traditional.count))}
              </span>
            </span>
          </div>
        )}
        {price?.by_market_type?.large_retail && (
          <div className={s.tableRow}>
            <span className={s.rowLabel}>{t('scanRetailAvg')}</span>
            <span className={s.amount}>
              <span className={s.priceSm}>
                {formatPrice(price.by_market_type.large_retail.price)}
              </span>
              <span className={s.unit}>
                {t('scanStoreCount').replace(
                  '{n}',
                  String(price.by_market_type.large_retail.count),
                )}
              </span>
            </span>
          </div>
        )}
        {price?.this_market && (
          <div className={s.tableRow}>
            <span className={s.rowLabel}>
              {t('scanThisMarket').replace('{name}', price.this_market.name)}
            </span>
            <span className={s.priceSm}>{formatPrice(price.this_market.price)}</span>
          </div>
        )}
        {price?.fallback && (
          <div className={s.tableRow}>
            <span className={s.rowLabel}>{t('scanFallback')}</span>
            <span className={s.empty}>{FALLBACK_LABELS[price.fallback]}</span>
          </div>
        )}
      </div>
      {price && (
        <p className={`${s.note} ${s.ruled}`}>
          {price.source}
          {!price.mock && price.observed_on && !price.source.includes(price.observed_on)
            ? ` · ${formatDate(price.observed_on)} ${t('scanSurveyed')}`
            : ''}
          {` · ${price.region}`}
        </p>
      )}
    </div>
  );
}

/** "1,500원을 품종마다 견주면": 같은 값을 품종마다 견줌. 줄을 누르면 그 품종으로 바꿈 */
export function VarietyCompare({
  price,
  seen,
  itemId,
  selected,
  onPick,
  more,
}: {
  price: Price;
  seen: number;
  itemId: string;
  selected?: string;
  onPick: (id: string) => void;
  more: string;
}) {
  const t = useT();
  const { state } = useLocation();
  return (
    <section className={s.group} aria-labelledby="variety-compare">
      <SectionHeader
        id="variety-compare"
        title={t('scanCompareTitle').replace('{price}', formatPrice(seen))}
        action={
          <Link className={s.smallLink} to={more} state={state}>
            {t('scanVarietyCompare')}
            <Icon name="chevronRight" size={18} />
          </Link>
        }
      />
      <List>
        {price.varieties.map((v) => (
          <ListRow
            key={v.variety_id}
            start={<ItemTile itemId={itemId} varietyId={v.variety_id} />}
            title={
              <>
                {v.name} {v.mock && <small>예시</small>}
                {v.variety_id === selected && (
                  <span className="sr-only"> ({t('scanSelected')})</span>
                )}
              </>
            }
            sub={
              v.reference_price == null
                ? t('scanNoReference')
                : `${t('scanReference')} ${formatPrice(v.reference_price)}${v.mock ? ' · 예시 시세 · 실제 조사값 아님' : ''}`
            }
            end={<BandCell band={varietyBand(seen, v.reference_price, price)} />}
            chevron={false}
            onClick={() => onPick(v.variety_id)}
          />
        ))}
      </List>
      <p className={`${s.note} ${s.ruled}`}>{t('scanCompareNote')}</p>
    </section>
  );
}

/** 최근 4주 시세(mock만. live는 API가 없어 숨김) */
export function PriceHistoryChart({
  itemId,
  varietyId,
  varietyName,
  marketId,
  unit,
  seen,
}: {
  itemId: string;
  varietyId?: string;
  varietyName?: string;
  marketId?: string;
  unit: string;
  seen?: number;
}) {
  const t = useT();
  const history = useResource(
    useCallback(
      () => (unit ? getPriceHistory(itemId, varietyId, unit, marketId) : Promise.resolve(null)),
      [itemId, varietyId, unit, marketId],
    ),
  );
  const chartId = useId();
  const allPoints = history.data?.points ?? [];
  const points = allPoints.filter((p) => p.price != null);
  if (points.length < 2) return null;
  const values = points.map((p) => p.price as number);
  const all = seen ? [...values, seen] : values;
  const lo = Math.min(...all) * 0.95;
  const hi = Math.max(...all) * 1.05;
  const W = 320;
  const H = 130;
  const x = (i: number) => 16 + (i * (W - 32)) / (allPoints.length - 1);
  const y = (v: number) => 10 + ((hi - v) / (hi - lo || 1)) * (H - 20);
  const change = values[values.length - 1] - values[0];
  const name = varietyName ?? '';
  const label = varietyName ? `${varietyName} ` : '';
  return (
    <section className={s.group} aria-labelledby={chartId}>
      <SectionHeader id={chartId} title={t('scanHistoryTitle').replace('{name}', label).trim()} />
      <svg
        className={s.chart}
        viewBox={`0 0 ${W} ${H + 24}`}
        role="img"
        aria-label={points
          .map((p) => `${formatDate(p.week_start)} ${formatPrice(p.price as number)}`)
          .join(', ')}
      >
        <line className={s.chartGrid} x1={0} x2={W} y1={H} y2={H} />
        {seen && <line className={s.chartSeen} x1={0} x2={W} y1={y(seen)} y2={y(seen)} />}
        <polyline
          className={s.chartLine}
          points={values.map((v, i) => `${x(allPoints.indexOf(points[i]))},${y(v)}`).join(' ')}
        />
        {values.map((v, i) => (
          <circle
            key={i}
            className={s.chartDot}
            cx={x(allPoints.indexOf(points[i]))}
            cy={y(v)}
            r={3.5}
          />
        ))}
        {points.map((p, i) => (
          <text
            key={p.week_start}
            className={s.chartLabel}
            x={x(allPoints.indexOf(points[i]))}
            y={H + 18}
            textAnchor="middle"
          >
            {Number(p.week_start.slice(5, 7))}/{Number(p.week_start.slice(8, 10))}
          </text>
        ))}
      </svg>
      <p className={s.note}>
        {seen ? `${t('scanHistorySeen')} ` : ''}
        {(change === 0
          ? t('scanHistorySame')
          : t(change < 0 ? 'scanHistoryDown' : 'scanHistoryUp').replace(
              '{amount}',
              formatPrice(Math.abs(change)),
            )
        ).replace('{name}', name ? `${name} ` : '')}
      </p>
      <p className={s.note}>{history.data?.source}</p>
    </section>
  );
}

/** 확인 포인트. 손님이 한 체크만 셈("4개 중 3개 확인"). 신선도 결론은 붙이지 않음 */
export function ChecklistSection({
  criteria,
  checked,
  onToggle,
  collapsed,
}: {
  criteria: Criterion[];
  checked: string[];
  onToggle: (key: string) => void;
  collapsed?: boolean;
}) {
  const t = useT();
  const count = t('scanCheckCount')
    .replace('{total}', String(criteria.length))
    .replace('{done}', String(checked.length));
  const sources = [...new Set(criteria.map((c) => c.source))].join(', ');
  const body = (
    <>
      <div>
        {criteria.map((c) => (
          <label className={s.check} key={c.key}>
            <input
              type="checkbox"
              checked={checked.includes(c.key)}
              onChange={() => onToggle(c.key)}
            />
            <span>{c.text}</span>
          </label>
        ))}
      </div>
      <p className={`${s.note} ${s.ruled}`}>
        {sources && `${t('scanCheckSource').replace('{source}', sources)} `}
        {t('scanCheckNotice')}
      </p>
    </>
  );
  if (!criteria.length)
    return (
      <section className={s.group}>
        <SectionHeader title={t('checklist')} />
        <p className={s.empty}>{t('noCriteria')}</p>
      </section>
    );
  if (collapsed)
    return (
      <details className={s.details}>
        <summary>
          <span style={{ flex: 1 }}>
            {t('scanCheckOpen').replace('{n}', String(criteria.length))}
          </span>
          <span className={s.note}>{count}</span>
          <Icon name="chevronRight" size={20} />
        </summary>
        {body}
      </details>
    );
  return (
    <section className={s.group} aria-labelledby="checklist">
      <SectionHeader id="checklist" title={t('checklist')} action={<span>{count}</span>} />
      {body}
    </section>
  );
}

/** 이 시장 판매 점포. 지금 보고 있는 가게, 마감세일, 추정 꼬리표, 손님·상인 확인 가격 */
export function SellingStores({
  title,
  stores,
  map,
  itemId,
  unit,
  storeId,
  reference,
  mapHref,
  total,
}: {
  title: string;
  stores: Store[];
  map: MarketMap | null;
  itemId: string;
  unit: string;
  storeId?: string;
  reference: number | null;
  mapHref: string;
  total: number;
}) {
  const t = useT();
  const listKey = `${itemId}:${map?.market_id}`;
  const [expandedFor, setExpandedFor] = useState('');
  const visible = expandedFor === listKey ? stores : stores.slice(0, 5);
  return (
    <section className={s.group} id="selling-stores" aria-labelledby="selling-title">
      <SectionHeader
        id="selling-title"
        title={title}
        action={
          total > 0 && (
            <Link className={s.smallLink} to={mapHref}>
              {t('scanStoresOnMap').replace('{n}', String(total))}
              <Icon name="chevronRight" size={18} />
            </Link>
          )
        }
      />
      {stores.length === 0 ? (
        <p className={s.empty}>{t('scanNoStores')}</p>
      ) : (
        <List label={title}>
          {visible.map((st) => {
            const zone = map?.zones.find((z) => z.id === st.zone_id)?.name;
            const band =
              reference != null &&
              st.price &&
              st.price.source !== 'market_avg' &&
              st.price.unit === unit
                ? bandOf(diffPct(st.price.price, reference))
                : null;
            return (
              <ListRow
                key={st.store_id}
                to={`/s/${encodeURIComponent(st.store_id)}?item=${encodeURIComponent(itemId)}&unit=${encodeURIComponent(unit)}`}
                start={<CategoryBadge category={storeCategory(st, zone)} size={44} />}
                title={st.name}
                chevron={false}
                end={band ? <MiniGauge band={band} /> : undefined}
              >
                <span className={s.storeSub}>
                  {st.store_id === storeId ? (
                    <span>{t('scanThisStore')}</span>
                  ) : st.active_sale ? (
                    <span className={s.sale}>
                      {t('scanSaleUntil').replace('{time}', saleTime(st.active_sale.ends_at))}
                    </span>
                  ) : zone ? (
                    <span>{zone}</span>
                  ) : null}
                  {st.guessed_item_ids.includes(itemId) && <span>{t('scanGuessTag')}</span>}
                  <StorePriceDisplay price={st.price} pendingReporters={st.pending_reporters} />
                </span>
              </ListRow>
            );
          })}
        </List>
      )}
      {stores.length > 5 && expandedFor !== listKey && (
        <Button variant="surface" size="md" onClick={() => setExpandedFor(listKey)}>
          {t('scanMore')}
        </Button>
      )}
    </section>
  );
}

/** 현장 가격 고치기(결과 화면 안) */
export function PriceEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <Field
      label={t('price')}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      suffix="원"
      placeholder={t('pricePlaceholder')}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
    />
  );
}
