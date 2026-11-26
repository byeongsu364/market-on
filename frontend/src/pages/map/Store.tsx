import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppHeader from '../../components/layout/AppHeader';
import MapView from '../../components/map/MapView';
import type { MapPin } from '../../components/map/MapView';
import Button, { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { ChipLink, Tag } from '../../components/common/Chip';
import { CategoryBadge, ItemTile, List, MiniGauge } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import StoreReviews from '../../components/domain/StoreReviews';
import RouteSheet from '../../components/domain/RouteSheet';
import { usePublicStore } from '../../hooks/useSales';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useMarket } from '../../hooks/useMarkets';
import { usePosition } from '../../hooks/usePosition';
import { usePrice } from '../../hooks/usePrice';
import { useItemCatalog } from '../../hooks/useFlows';
import { useAction, useResource } from '../../hooks/useResource';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useSession } from '../../store/session';
import {
  favoritesAvailable,
  getFavorites,
  removeFavorite,
  saveFavorite,
} from '../../api/favorites';
import { isMock } from '../../api/client';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { CATEGORY_LABELS, storeCategory } from '../../utils/category';
import { storeDestination } from '../../utils/directions';
import { formatPrice } from '../../utils/formatPrice';
import { unitLabel } from '../../utils/convertUnit';
import type { Market } from '../../types/contract';
import { SaleRow } from './parts';
import { priceWho, storeBand } from './helpers';
import s from './map.module.css';

/** 점포 상세(시안 Store · WebStore). 점포 QR이 여는 화면이고 주요 버튼은 길 안내 */
export default function Store() {
  const t = useT();
  const desktop = useIsDesktop();
  const { storeId = '' } = useParams();
  const ctx = useShoppingContext();
  const session = useSession();
  const state = usePublicStore(storeId);
  const marketId = state.data?.store.market_id ?? '';
  const map = useMarketMap(marketId, ctx.itemId, ctx.unit);
  const detail = useMarket(marketId);
  const market: Market | null =
    detail.data ?? (session.market?.market_id === marketId ? session.market : null);
  const { position } = usePosition();
  const catalog = useItemCatalog();
  const [route, setRoute] = useState(false);
  const closeRoute = useCallback(() => setRoute(false), []);

  // QR로 들어온 점포를 다음 찍기의 점포로 기억하고, 시장도 맞춤
  useEffect(() => {
    if (!state.data) return;
    session.setStoreContext({ store_id: storeId, market_id: state.data.store.market_id });
    const found = detail.data;
    if (found && found.status === 'active' && session.market?.market_id !== found.market_id)
      session.setMarket(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.store.market_id, storeId, detail.data]);

  const zones = useMemo(() => map.data?.zones ?? [], [map.data]);
  const mapStore = map.data?.stores.find((x) => x.store_id === storeId);
  const category = mapStore
    ? storeCategory(mapStore, zones.find((z) => z.id === mapStore.zone_id)?.name)
    : null;
  const item = catalog.data?.find((i) => i.item_id === ctx.itemId);
  const storePrice = mapStore?.price ?? null;
  const price = usePrice({
    item_id: ctx.itemId ?? '',
    market_id: marketId,
    unit: storePrice?.unit ?? ctx.unit ?? item?.default_unit ?? '',
  });
  const varietyName = price.data?.varieties.find(
    (v) => v.variety_id === (ctx.varietyId ?? price.data?.variety_id),
  )?.name;

  const favorites = useResource(
    useCallback(() => (favoritesAvailable ? getFavorites() : Promise.resolve([])), []),
  );
  const [saved, setSaved] = useState<boolean | null>(null);
  const isSaved = saved ?? !!favorites.data?.some((f) => f.store_id === storeId);
  const toggleSaved = useAction(async () => {
    if (!state.data) return;
    if (isSaved) await removeFavorite(storeId);
    else
      await saveFavorite({
        store_id: storeId,
        name: state.data.store.name,
        market_id: state.data.store.market_id,
      });
    setSaved(!isSaved);
  });

  const pins: MapPin[] = useMemo(
    () =>
      (map.data?.stores ?? [])
        .filter((x) => x.lat != null && x.lng != null)
        .map((x) => ({
          id: x.store_id,
          name: x.name,
          lat: x.lat!,
          lng: x.lng!,
          category: storeCategory(x, zones.find((z) => z.id === x.zone_id)?.name),
          state: x.store_id === storeId ? ('selected' as const) : ('dim' as const),
        })),
    [map.data, zones, storeId],
  );
  const hasPin = pins.some((p) => p.id === storeId);

  if (!state.data)
    return (
      <>
        {!desktop && <AppHeader title={t('mapStoreTitle')} />}
        <div className="page">
          <Resource state={state}>{null}</Resource>
        </div>
      </>
    );
  const data = state.data;
  const marketName = market?.name ?? '';
  const sub = [
    desktop && marketName,
    category && CATEGORY_LABELS[category],
    mapStore?.open_now === true && t('mapOpenNow'),
  ]
    .filter(Boolean)
    .join(desktop ? ' ' : ', ');
  const scanHref = ctx.href('/scan', { market: marketId, store: storeId });
  const backHref = ctx.itemId
    ? ctx.href('/', { market: marketId, item: ctx.itemId, store: storeId })
    : ctx.href('/', { market: marketId });
  const destination = market
    ? { ...storeDestination({ ...data.store, ...mapStore, name: data.store.name }, market) }
    : null;

  const shareButton =
    typeof navigator !== 'undefined' && 'share' in navigator ? (
      <button
        type="button"
        className={s.headerIcon}
        aria-label={t('mapShare')}
        onClick={() =>
          void navigator
            .share({ title: data.store.name, url: window.location.href })
            .catch(() => {})
        }
      >
        <Icon name="share" />
      </button>
    ) : null;
  const saveButton = favoritesAvailable ? (
    <button
      type="button"
      className={s.headerIcon}
      aria-pressed={isSaved}
      aria-label={isSaved ? t('mapUnsave') : t('mapSave')}
      disabled={toggleSaved.loading}
      onClick={() => void toggleSaved.run()}
    >
      <Icon name="bookmark" strokeWidth={isSaved ? 2.4 : 1.7} />
    </button>
  ) : null;

  const miniMap = hasPin && (
    <div className={desktop ? s.bigMap : s.storeMap}>
      <MapView
        className={s.fill}
        label={fill(t('mapStoreMapLabel'), { name: data.store.name })}
        pins={pins}
        boundary={desktop ? map.data?.boundary : undefined}
        boundaryLabel={desktop ? marketName : undefined}
        center={pins.find((p) => p.id === storeId)}
        sample={map.data?.layout === 'schematic'}
      />
    </div>
  );

  const content = (
    <>
      <div className={s.storeHead}>
        <CategoryBadge category={category} size={56} />
        <div className={s.rowBody}>
          <div className={s.nameRow}>
            <h1 className={desktop ? s.titleWeb : s.title}>{data.store.name}</h1>
            {mapStore?.verified && <Tag>{t('mapVerified')}</Tag>}
          </div>
          {sub && <span className={s.sub15}>{sub}</span>}
          {data.source === 'sbiz' && <span className="caption">{t('mapPublicName')}</span>}
        </div>
      </div>
      {desktop && (
        <div className={s.buttons}>
          <Button
            variant="primary"
            grow
            disabled={!destination}
            onClick={() => setRoute(true)}
            icon={<Icon name="navigate" size={20} />}
          >
            {t('mapRoute')}
          </Button>
          <ButtonLink to={scanHref} variant="surface" grow icon={<Icon name="camera" size={20} />}>
            {t('mapScanHere')}
          </ButtonLink>
        </div>
      )}
      {!desktop && miniMap}
      {ctx.itemId && (
        <section className={s.stack2} aria-labelledby="store-price">
          <h2 id="store-price" className={s.h2Row}>
            {t('mapCheckedPrice')}
          </h2>
          <div className={s.priceRow}>
            <ItemTile itemId={ctx.itemId} varietyId={ctx.varietyId} size={48} />
            <div className={s.rowBody}>
              <span className={s.rowTitle}>
                {[item?.name, varietyName, storePrice && unitLabel(storePrice.unit)]
                  .filter(Boolean)
                  .join(' ')}
              </span>
              <span className={s.rowSub}>
                {storePrice ? priceWho(storePrice, t) : t('mapNoStorePrice')}
              </span>
            </div>
            {storePrice && (
              <div className={s.priceEnd}>
                <span className={s.price20}>{formatPrice(storePrice.price)}</span>
                <MiniGauge
                  band={mapStore ? storeBand(mapStore, price.data, ctx.varietyId) : null}
                />
              </div>
            )}
          </div>
        </section>
      )}
      <section aria-labelledby="store-items">
        <h2 id="store-items" className={s.h2Row}>
          {t('mapSells')}
        </h2>
        <div className={s.chipWrap}>
          {data.items.map((i) => (
            <ChipLink
              key={i.item_id}
              to={ctx.href(`/items/${encodeURIComponent(i.item_id)}`, {
                market: marketId,
                store: storeId,
              })}
              icon={<ItemTile itemId={i.item_id} size={20} />}
            >
              {i.name}
              {data.guessed_item_ids.includes(i.item_id) && (
                <span className={s.chipNote}>{t('mapGuessed')}</span>
              )}
            </ChipLink>
          ))}
        </div>
      </section>
      {(mapStore?.intro || data.store.intro) && <p>{mapStore?.intro || data.store.intro}</p>}
      <ul className={s.infoList}>
        {/* 영업시간이 비어 있으면(공공데이터에 없음) "부터 까지"만 남지 않게 줄을 뺌 */}
        {data.store.hours.open && data.store.hours.close && (
          <li>
            <Icon name="clock" />
            <span className={s.rowBody}>
              <span className={s.infoTitle}>
                {fill(t('mapHours'), {
                  open: data.store.hours.open,
                  close: data.store.hours.close,
                })}
              </span>
              <span className={s.rowSub}>
                {data.source === 'sbiz' ? t('mapHoursPublic') : t('mapHoursMerchant')}
              </span>
            </span>
          </li>
        )}
        {mapStore?.payments?.includes('onnuri') && (
          <li>
            <Icon name="card" />
            <span className={s.rowBody}>
              <span className={s.infoTitle}>{t('mapOnnuriTitle')}</span>
              {isMock && <span className={s.rowSub}>{t('mapPaymentsSample')}</span>}
            </span>
          </li>
        )}
      </ul>
      {data.sales.length > 0 && (
        <section aria-labelledby="store-sales">
          <h2 id="store-sales" className={s.h2Row}>
            {t('closingSales')}
          </h2>
          <List>
            {data.sales.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                to={ctx.href(`/items/${encodeURIComponent(sale.item_id)}`, {
                  market: marketId,
                  store: storeId,
                })}
              />
            ))}
          </List>
        </section>
      )}
      <StoreReviews key={storeId} storeId={storeId} />
      {favoritesAvailable && desktop && (
        <Button
          variant="text"
          aria-pressed={isSaved}
          onClick={() => void toggleSaved.run()}
          icon={<Icon name="bookmark" size={20} />}
        >
          {isSaved ? t('mapUnsave') : t('mapSave')}
        </Button>
      )}
    </>
  );

  const sheet = route && destination && (
    <RouteSheet
      storeId={data.store.store_id}
      destination={{ ...destination, label: data.store.name }}
      approximate={destination.approximate}
      kind="store"
      me={position}
      onClose={closeRoute}
    />
  );

  if (desktop)
    return (
      <div className={s.split}>
        <aside className={s.panel} aria-label={data.store.name}>
          <Link to={backHref} className={s.backLink}>
            <Icon name="back" size={18} />
            {ctx.itemId && item
              ? fill(t('mapSellersTitle'), { item: item.name })
              : fill(t('mapStoreListOf'), { name: marketName })}
          </Link>
          {content}
        </aside>
        <div className={s.mapSection}>{miniMap}</div>
        {sheet}
      </div>
    );
  return (
    <div className={s.storePage}>
      <AppHeader
        title={marketName}
        back={backHref}
        end={
          <>
            {shareButton}
            {saveButton}
          </>
        }
      />
      <div className={s.storeBody}>{content}</div>
      <div className={s.bottomBar}>
        <Button
          variant="primary"
          grow
          disabled={!destination}
          onClick={() => setRoute(true)}
          icon={<Icon name="navigate" size={20} />}
        >
          {t('mapRoute')}
        </Button>
        <ButtonLink to={scanHref} variant="surface" grow icon={<Icon name="camera" size={20} />}>
          {t('mapScanHere')}
        </ButtonLink>
      </div>
      {sheet}
    </div>
  );
}
