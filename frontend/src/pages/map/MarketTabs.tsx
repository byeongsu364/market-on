import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { ItemTile, List } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import { useResource } from '../../hooks/useResource';
import { usePrice } from '../../hooks/usePrice';
import { useItemCatalog } from '../../hooks/useFlows';
import { getInSeason } from '../../api/items';
import { getMarketItems } from '../../api/markets';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { formatPrice } from '../../utils/formatPrice';
import { unitLabel } from '../../utils/convertUnit';
import type { ActiveSale, Item, Market, MarketItem } from '../../types/contract';
import { SaleRow } from './parts';
import s from './map.module.css';

const marketItemHref = (market: Market, itemId: string) =>
  `/?market=${encodeURIComponent(market.market_id)}&item=${encodeURIComponent(itemId)}`;

/** 마감세일 탭(시안 Sales): 이 시장에서 지금 올라온 세일 */
export function SalesTab({
  market,
  sales,
  storeHref,
}: {
  market: Market;
  sales: { data: ActiveSale[] | null; loading: boolean; error: string; retry?: () => void };
  storeHref: (id: string) => string;
}) {
  const t = useT();
  const stores = new Set(sales.data?.map((x) => x.store_id)).size;
  return (
    <section className={s.tabSection} aria-labelledby="map-sales-title">
      <div className={s.heading}>
        <h2 id="map-sales-title" className={s.h2}>
          {t('mapSalesTitle')}
        </h2>
        {!!sales.data?.length && (
          <p className={s.lead}>{fill(t('mapSalesLead'), { name: market.name, count: stores })}</p>
        )}
      </div>
      <Resource state={sales}>
        {sales.data?.length ? (
          <List label={t('mapSalesTitle')}>
            {sales.data.map((sale) => (
              <SaleRow key={sale.id} sale={sale} to={storeHref(sale.store_id)} />
            ))}
          </List>
        ) : (
          <p className={s.lead}>{t('mapNoSales')}</p>
        )}
      </Resource>
    </section>
  );
}

const seoulMonth = () =>
  Number(
    new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date()),
  );

/** 제철과 시세 탭(시안 MarketInfo): 예전 홈의 제철과 오늘 기준시세를 옮김 */
export function InfoTab({ market }: { market: Market }) {
  const [morePrices, setMorePrices] = useState(false);
  const t = useT();
  const month = seoulMonth();
  const seasonal = useResource(useCallback(() => getInSeason(month), [month]));
  const items = useResource(
    useCallback(() => getMarketItems(market.market_id), [market.market_id]),
  );
  const catalog = useItemCatalog();
  const count = (id: string) => items.data?.find((i) => i.item_id === id)?.store_count;
  const priced: { market: MarketItem; item: Item }[] = (items.data ?? [])
    .map((m) => ({ market: m, item: catalog.data?.find((i) => i.item_id === m.item_id) }))
    .filter((x): x is { market: MarketItem; item: Item } => !!x.item);
  return (
    <div className={s.tabSection}>
      {!!seasonal.data?.length && (
        <section aria-label={fill(t('mapSeasonTitle'), { month })}>
          <h2 className={s.h2Row}>{fill(t('mapSeasonTitle'), { month })}</h2>
          <List>
            {seasonal.data.map((i) => (
              <li key={i.item_id}>
                <Link to={marketItemHref(market, i.item_id)} className={s.row}>
                  <ItemTile itemId={i.item_id} size={44} />
                  <span className={s.rowBody}>
                    <span className={s.rowTitle}>{i.name}</span>
                    <span className={s.rowSub}>{fill(t('mapSeasonSub'), { month })}</span>
                  </span>
                  <span className={s.rowEnd}>
                    {count(i.item_id) != null && (
                      <span className={s.countEnd}>
                        {fill(t('mapCount'), { count: count(i.item_id)! })}
                      </span>
                    )}
                    <Icon name="chevronRight" size={20} />
                  </span>
                </Link>
              </li>
            ))}
          </List>
        </section>
      )}
      <section aria-labelledby="map-prices-title">
        <div className={s.h2Row}>
          <h2 id="map-prices-title" className={s.h2}>
            {t('prices')}
          </h2>
        </div>
        <Resource state={items}>
          <List>
            {(morePrices ? priced : priced.slice(0, 12)).map(({ item }) => (
              <PriceRows key={item.item_id} item={item} market={market} />
            ))}
          </List>
          {!morePrices && priced.length > 12 && (
            <button type="button" onClick={() => setMorePrices(true)}>
              품목 더 보기 ({priced.length})
            </button>
          )}
        </Resource>
      </section>
    </div>
  );
}

/** 품목의 오늘 기준시세 한 줄(품종별 기준시세가 있으면 품종마다 한 줄). 숫자 아래 출처와 조사일 */
function PriceRows({ item, market }: { item: Item; market: Market }) {
  const t = useT();
  const price = usePrice({
    item_id: item.item_id,
    market_id: market.market_id,
    unit: item.default_unit,
  });
  if (!price.data) return null;
  const p = price.data;
  const rows = p.varieties.length
    ? p.varieties
        .filter((v) => v.reference_price != null)
        .map((v) => ({
          key: v.variety_id,
          name: `${item.name} ${v.name}`,
          value: v.reference_price!,
          variety: v.variety_id,
        }))
    : [{ key: item.item_id, name: item.name, value: p.reference_price, variety: undefined }];
  const source = p.source.includes(p.observed_on)
    ? p.source
    : fill(t('mapPriceSource'), { source: p.source, date: p.observed_on });
  return (
    <>
      {rows.map((r) => (
        <li key={r.key}>
          <Link
            to={`/items/${encodeURIComponent(item.item_id)}?${new URLSearchParams({
              market: market.market_id,
              ...(r.variety ? { variety: r.variety } : {}),
            }).toString()}`}
            className={s.row}
          >
            <ItemTile itemId={item.item_id} varietyId={r.variety} size={44} />
            <span className={s.rowBody}>
              <span className={s.rowTitle}>{r.name}</span>
              <span className={s.rowSub}>{unitLabel(p.unit)}</span>
              <span className={s.caption12}>{source}</span>
            </span>
            <span className={s.price17}>{formatPrice(r.value)}</span>
          </Link>
        </li>
      ))}
      {rows.length > 1 && (
        <li>
          <Link
            to={`/items/${encodeURIComponent(item.item_id)}/varieties?market=${encodeURIComponent(market.market_id)}`}
            className={s.rowAction}
          >
            {fill(t('mapCompareVarieties'), { item: item.name })}
            <Icon name="chevronRight" size={18} />
          </Link>
        </li>
      )}
    </>
  );
}
