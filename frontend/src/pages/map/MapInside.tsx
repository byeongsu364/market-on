import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView from '../../components/map/MapView';
import type { MapPin } from '../../components/map/MapView';
import { Chip, ChipRow } from '../../components/common/Chip';
import Button, { ButtonLink } from '../../components/common/Button';
import Icon, { CategoryGlyph } from '../../components/common/Icon';
import { List, Tabs } from '../../components/common/parts';
import Loading from '../../components/common/Loading';
import ErrorBox from '../../components/common/ErrorBox';
import MiniMap from '../../components/domain/MiniMap';
import RouteSheet from '../../components/domain/RouteSheet';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useMarket, useMarkets } from '../../hooks/useMarkets';
import { usePosition } from '../../hooks/usePosition';
import { useActiveSales } from '../../hooks/useSales';
import { usePrice } from '../../hooks/usePrice';
import { useItemCatalog } from '../../hooks/useFlows';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useSession } from '../../store/session';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { distanceM, storeDestination } from '../../utils/directions';
import { CATEGORY_LABELS, categoryColor, storeCategory } from '../../utils/category';
import { formatPrice } from '../../utils/formatPrice';
import type { Market, Store, StoreCategory } from '../../types/contract';
import {
  Amenities,
  MapError,
  MapLayout,
  RequestPanel,
  SearchPill,
  SelectedStoreCard,
  StoreLinkRow,
  StoreResultRow,
} from './parts';
import { priceWho, storeBand, type StoreView } from './helpers';
import { InfoTab, SalesTab } from './MarketTabs';
import s from './map.module.css';

const LIST_LIMIT = 10;
type Tab = 'stores' | 'sales' | 'info';
type Filters = { open: boolean; sale: boolean; onnuri: boolean; verified: boolean };
const NO_FILTERS: Filters = { open: false, sale: false, onnuri: false, verified: false };

/** 지도 홈, 시장 안(`/?market=`)과 품목 검색 결과(`/?market=&item=`) */
export default function MapInside({ marketId }: { marketId: string }) {
  const t = useT();
  const session = useSession();
  const detail = useMarket(marketId);
  const fromSession = session.market?.market_id === marketId ? session.market : null;
  const market = detail.data ?? fromSession;
  if (!market)
    return detail.loading ? (
      <div className="page">
        <Loading />
      </div>
    ) : (
      <div className="page">
        <h1 className={s.title}>{t('mapMarketNotFound')}</h1>
        <ButtonLink to="/markets" variant="primary" wide>
          {t('mapErrorList')}
        </ButtonLink>
      </div>
    );
  if (market.status === 'listed') return <ListedMarket market={market} />;
  return <MarketView market={market} />;
}

/** 준비 중 시장(시안 Request) */
function ListedMarket({ market }: { market: Market }) {
  const markets = useMarkets();
  const others = markets.data ?? [];
  const t = useT();
  const desktop = useIsDesktop();
  const session = useSession();
  if (markets.loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  const alternative =
    session.nearbyActive ??
    others
      .filter((m) => m.status === 'active')
      .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))[0] ??
    null;
  return (
    <MapLayout
      desktop={desktop}
      label={market.name}
      map={
        <MapView
          label={fill(t('mapMarketLabel'), { name: market.name })}
          markets={[
            {
              id: market.market_id,
              name: market.name,
              lat: market.lat,
              lng: market.lng,
              active: true,
            },
          ]}
          center={market}
          bottomInset={desktop ? 0 : 320}
        />
      }
      top={
        <Link to="/" state={{ around: true }} aria-label={t('mapBack')} className={s.roundBack}>
          <Icon name="back" />
        </Link>
      }
      panel={<RequestPanel market={market} alternative={alternative} desktop={desktop} />}
    />
  );
}

function MarketView({ market }: { market: Market }) {
  const t = useT();
  const desktop = useIsDesktop();
  const session = useSession();
  const ctx = useShoppingContext();
  const itemId = ctx.itemId;
  const tabParam = ctx.params.get('tab');
  const tab: Tab = tabParam === 'sales' || tabParam === 'info' ? tabParam : 'stores';
  const map = useMarketMap(market.market_id, itemId, ctx.unit);
  const { position } = usePosition();
  const sales = useActiveSales(market.market_id);
  const catalog = useItemCatalog();
  const item = catalog.data?.find((i) => i.item_id === itemId);
  const itemName = item?.name ?? t('item');
  const requestedCategory = ctx.params.get('category');
  const [category, setCategory] = useState<StoreCategory | 'all'>(() =>
    requestedCategory && Object.hasOwn(CATEGORY_LABELS, requestedCategory)
      ? (requestedCategory as StoreCategory)
      : 'all',
  );
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [near, setNear] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [more, setMore] = useState(false);
  const [route, setRoute] = useState<StoreView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onFailure = useCallback(() => setFailed(true), []);
  const closeRoute = useCallback(() => setRoute(null), []);

  const views: StoreView[] = useMemo(() => {
    const zones = map.data?.zones ?? [];
    return (map.data?.stores ?? []).map((store) => ({
      store,
      category: storeCategory(store, zones.find((z) => z.id === store.zone_id)?.name),
      distance:
        position && store.lat != null && store.lng != null
          ? distanceM(position, { lat: store.lat, lng: store.lng })
          : null,
    }));
  }, [map.data, position]);
  const selected = views.find((v) => v.store.store_id === ctx.storeId) ?? null;

  // 작은 눈금: 기준시세(품종별 값은 varieties에서)와 점포 가격을 같은 단위일 때만 견줌.
  // 품종을 바꿔도 다시 묻지 않게 variety_id 없이 받음(품종 칩이 깜빡이지 않게)
  const priceUnit = selected?.store.price?.unit ?? ctx.unit ?? item?.default_unit ?? '';
  const price = usePrice({
    item_id: itemId ?? '',
    market_id: market.market_id,
    unit: priceUnit,
  });
  const bandFor = (store: Store) => storeBand(store, price.data, ctx.varietyId);

  const has = {
    open: views.some((v) => v.store.open_now !== undefined),
    onnuri: views.some((v) => v.store.payments !== undefined),
    verified: views.some((v) => v.store.verified),
  };
  const matches = (v: StoreView) => {
    const st = v.store;
    if (itemId && !st.highlight) return false;
    if (!itemId && category !== 'all' && v.category !== category) return false;
    if (itemId && ctx.varietyId && st.varieties && !st.varieties.includes(ctx.varietyId))
      return false;
    if (filters.open && st.open_now !== true) return false;
    if (filters.sale && !st.active_sale) return false;
    if (filters.onnuri && !st.payments?.includes('onnuri')) return false;
    if (filters.verified && !st.verified) return false;
    return true;
  };
  const listed = views.filter(matches);
  const sorted =
    near && listed.some((v) => v.distance !== null)
      ? [...listed].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      : listed;
  const shown = more ? sorted : sorted.slice(0, LIST_LIMIT);
  const hasCoords = views.some((v) => v.store.lat != null && v.store.lng != null);
  const categories = (Object.keys(CATEGORY_LABELS) as StoreCategory[])
    .map((c) => ({ c, n: views.filter((v) => v.category === c).length }))
    .filter((x) => x.n > 0);
  const varieties = (price.data?.varieties ?? []).filter((v) =>
    views.some((x) => x.store.highlight && x.store.varieties?.includes(v.variety_id)),
  );
  const saleCount = new Set(sales.data?.map((x) => x.store_id)).size;

  const select = (id: string) => {
    session.setStoreContext({ store_id: id, market_id: market.market_id });
    ctx.update({ store: id }, true);
  };
  const storeHref = (id: string) =>
    ctx.href(`/s/${encodeURIComponent(id)}`, {
      market: market.market_id,
      item: itemId ?? null,
      variety: ctx.varietyId ?? null,
      unit: ctx.unit ?? null,
    });
  const marketOnly = `/?market=${encodeURIComponent(market.market_id)}`;

  const pins: MapPin[] = hasCoords
    ? views
        .filter((v) => v.store.lat != null && v.store.lng != null)
        .map((v) => {
          const isSelected = v.store.store_id === ctx.storeId;
          return {
            id: v.store.store_id,
            name: v.store.name,
            lat: v.store.lat!,
            lng: v.store.lng!,
            category: v.category,
            sale: !!v.store.active_sale,
            state: isSelected ? 'selected' : matches(v) ? 'default' : 'dim',
            caption:
              isSelected && itemId && v.store.price
                ? `${formatPrice(v.store.price.price)}${v.store.price.source === 'market_avg' ? ` · ${priceWho(v.store.price, t)}` : ''}`
                : undefined,
          };
        })
    : [];

  const top = (
    <>
      <SearchPill
        back={itemId ? marketOnly : '/'}
        backState={itemId ? undefined : { around: true }}
        to={ctx.href('/search', { market: market.market_id }, { q: itemId ? itemName : null })}
        text={fill(t('mapSearchIn'), { name: market.name })}
        value={itemId ? itemName : undefined}
        clear={itemId ? marketOnly : undefined}
      />
      {!desktop && (itemId ? filterChips() : tab === 'stores' && categoryChips(true))}
    </>
  );

  function categoryChips(float: boolean) {
    if (!categories.length) return null;
    return (
      <ChipRow label={t('mapCategoryFilter')} className={float ? s.floatChips : undefined}>
        <Chip float={float} pressed={category === 'all'} onClick={() => setCategory('all')}>
          {t('mapAll')} <span className={s.count}>{views.length}</span>
        </Chip>
        {categories.map(({ c, n }) => (
          <Chip
            key={c}
            float={float}
            pressed={category === c}
            onClick={() => setCategory(category === c ? 'all' : c)}
            icon={<CategoryGlyph category={c} size={18} color={categoryColor(c)} />}
          >
            {CATEGORY_LABELS[c]} <span className={s.count}>{n}</span>
          </Chip>
        ))}
      </ChipRow>
    );
  }
  function toggle(key: keyof Filters) {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  }
  function filterChips(float = !desktop) {
    return (
      <ChipRow
        label={t('mapResultFilter')}
        wrap={desktop}
        className={float ? s.floatChips : undefined}
      >
        <Chip float={float} pressed={near} onClick={() => setNear(!near)}>
          {t('mapNearest')}
        </Chip>
        {itemId &&
          varieties.slice(0, 8).map((v) => (
            <Chip
              key={v.variety_id}
              float={float}
              pressed={ctx.varietyId === v.variety_id}
              onClick={() =>
                ctx.update(
                  { variety: ctx.varietyId === v.variety_id ? null : v.variety_id, store: null },
                  true,
                )
              }
            >
              {v.name}
            </Chip>
          ))}
        {has.open && (
          <Chip float={float} pressed={filters.open} onClick={() => toggle('open')}>
            {t('mapOpenNow')}
          </Chip>
        )}
        {itemId && (
          <Chip float={float} pressed={filters.sale} onClick={() => toggle('sale')}>
            {t('closingBadge')}
          </Chip>
        )}
        {has.onnuri && (!itemId || desktop) && (
          <Chip float={float} pressed={filters.onnuri} onClick={() => toggle('onnuri')}>
            {t('mapOnnuriShort')}
          </Chip>
        )}
        {!itemId && has.verified && (
          <Chip float={float} pressed={filters.verified} onClick={() => toggle('verified')}>
            {t('mapVerified')}
          </Chip>
        )}
      </ChipRow>
    );
  }

  const card = selected && (
    <SelectedStoreCard
      view={selected}
      itemName={itemId ? itemName : undefined}
      band={itemId ? bandFor(selected.store) : null}
      storeHref={storeHref(selected.store.store_id)}
      onRoute={() => setRoute(selected)}
    />
  );
  const moreButton = sorted.length > LIST_LIMIT && !more && (
    <Button variant="surface" size="md" wide onClick={() => setMore(true)}>
      {t('mapMore')}
    </Button>
  );
  const headVisible = desktop || expanded;
  const header = (
    <div className={s.heading6}>
      {desktop && (
        <Link
          to={itemId ? marketOnly : '/'}
          state={itemId ? undefined : { around: true }}
          className={s.backLink}
        >
          <Icon name="back" size={18} />
          {itemId ? fill(t('mapStoreListOf'), { name: market.name }) : t('mapAroundMarkets')}
        </Link>
      )}
      <div className={s.nameRow}>
        <h1 className={desktop ? s.titleWeb : headVisible ? s.title24 : 'sr-only'}>
          {market.name}
        </h1>
        {!desktop && expanded && (
          <button type="button" className={s.textAction} onClick={() => setExpanded(false)}>
            {t('mapShowMap')}
            <Icon name="chevronRight" size={18} />
          </button>
        )}
      </div>
      {desktop && (market.address || market.store_count != null) && (
        <span className={s.sub15}>
          {[
            market.address,
            market.store_count != null && fill(t('mapFoodStores'), { count: market.store_count }),
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
      )}
      {headVisible && <Amenities market={market} />}
    </div>
  );

  const mapState = map.loading ? (
    <Loading />
  ) : map.error ? (
    <ErrorBox message={map.error} retry={map.retry} />
  ) : null;

  let panel;
  if (itemId) {
    panel = (
      <div className={s.panelStack}>
        {desktop ? header : <h1 className="sr-only">{market.name}</h1>}
        <div className={s.stack6}>
          <div className={s.resultHead}>
            <h2 className={s.h2}>{fill(t('mapSellersTitle'), { item: itemName })}</h2>
            {map.data && (
              <span className={s.resultCount}>
                {fill(t('mapCount'), { count: views.filter((v) => v.store.highlight).length })}
              </span>
            )}
            {!desktop && (
              <button
                type="button"
                className={s.textAction}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? t('mapShowMap') : t('mapShowList')}
                <Icon name="chevronRight" size={18} />
              </button>
            )}
          </div>
          {desktop && filterChips(false)}
        </div>
        {mapState}
        {card}
        {map.data && (
          <>
            {sorted.length ? (
              <List label={fill(t('mapSellersTitle'), { item: itemName })}>
                {shown.map((v) => (
                  <StoreResultRow
                    key={v.store.store_id}
                    view={v}
                    itemName={itemName}
                    selected={v.store.store_id === ctx.storeId}
                    onSelect={() => select(v.store.store_id)}
                  />
                ))}
              </List>
            ) : (
              <p className={s.lead}>{t('mapNoSellers')}</p>
            )}
            {moreButton}
          </>
        )}
      </div>
    );
  } else {
    const tabs = [
      {
        value: 'stores' as const,
        label: `${t('mapTabStores')} ${map.data?.stores.length ?? ''}`.trim(),
      },
      {
        value: 'sales' as const,
        label: saleCount ? `${t('closingBadge')} ${saleCount}` : t('closingBadge'),
      },
      { value: 'info' as const, label: t('mapTabInfo') },
    ];
    panel = (
      <div className={s.panelStack}>
        {header}
        {card}
        <div className={s.stack6}>
          <Tabs
            label={t('mapTabsLabel')}
            tabs={tabs}
            value={tab}
            onChange={(v) => ctx.update({ tab: v === 'stores' ? null : v }, true)}
          />
          <div role="tabpanel" aria-label={tabs.find((x) => x.value === tab)?.label}>
            {tab === 'stores' && (
              <div className={s.stack6}>
                {desktop && categoryChips(false)}
                {(expanded || desktop) && filterChips(false)}
                {mapState}
                {map.data && (
                  <>
                    <List label={t('mapTabStores')}>
                      {shown.map((v) => (
                        <StoreLinkRow
                          key={v.store.store_id}
                          view={v}
                          to={storeHref(v.store.store_id)}
                        />
                      ))}
                    </List>
                    {!sorted.length && <p className={s.lead}>{t('mapNoStores')}</p>}
                    {moreButton}
                  </>
                )}
              </div>
            )}
            {tab === 'sales' && <SalesTab market={market} sales={sales} storeHref={storeHref} />}
            {tab === 'info' && <InfoTab market={market} />}
          </div>
        </div>
      </div>
    );
  }

  if (failed)
    return (
      <div className={s.errorStage}>
        {!desktop && <div className={s.top}>{top}</div>}
        <MapError
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );

  const boundary = map.data?.boundary ?? market.boundary;
  const mapNode =
    !map.data || hasCoords ? (
      <MapView
        key={attempt}
        label={fill(t('mapMarketLabel'), { name: market.name })}
        boundary={boundary}
        boundaryLabel={boundary ? market.name : undefined}
        facilities={itemId ? undefined : (map.data?.facilities ?? market.facilities)}
        pins={pins}
        me={position ?? null}
        center={market}
        sample={hasCoords && map.data?.layout === 'schematic'}
        onSelect={(id, type) => type === 'pin' && select(id)}
        topInset={desktop ? 0 : 120}
        bottomInset={desktop ? 0 : 300}
        onFailure={onFailure}
      />
    ) : (
      <div className={s.miniMapArea}>
        <MiniMap
          map={map.data}
          itemName={itemId ? itemName : undefined}
          selectedId={ctx.storeId}
          onStore={(store) => select(store.store_id)}
        />
      </div>
    );

  return (
    <>
      <MapLayout
        desktop={desktop}
        label={
          itemId
            ? fill(t('mapSellersTitle'), { item: itemName })
            : fill(t('mapMarketPanel'), { name: market.name })
        }
        map={mapNode}
        top={top}
        panel={panel}
        expanded={expanded}
        onExpandedChange={setExpanded}
      />
      {route && (
        <RouteSheet
          storeId={route.store.store_id}
          destination={{ ...storeDestination(route.store, market), label: route.store.name }}
          approximate={storeDestination(route.store, market).approximate}
          kind="store"
          me={position}
          onClose={closeRoute}
        />
      )}
    </>
  );
}
