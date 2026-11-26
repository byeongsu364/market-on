import ReviewSummary from '../../components/domain/ReviewSummary';
import { useCallback, type ReactNode, type RefObject } from 'react';
import { Link, type To } from 'react-router-dom';
import NotificationBell from '../../components/layout/NotificationBell';
import FavoriteButton from '../../components/domain/FavoriteButton';
import BottomSheet from '../../components/common/BottomSheet';
import Button, { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { CategoryBadge, ItemTile, List, MiniGauge } from '../../components/common/parts';
import { Tag } from '../../components/common/Chip';
import { useAction, useResource } from '../../hooks/useResource';
import { useSaleView } from '../../hooks/useSales';
import { getDemand, requestMarket } from '../../api/marketRequests';
import { useT } from '../../i18n';
import { fill, josaPair } from '../../utils/josa';
import { people } from '../../utils/people';
import { formatPrice } from '../../utils/formatPrice';
import { saleTime, seoulDay } from '../../utils/sale';
import { unitLabel } from '../../utils/convertUnit';
import { formatDistance, walkMinutes } from '../../utils/directions';
import { priceWho, storeSub, type StoreView } from './helpers';
import { CATEGORY_LABELS } from '../../utils/category';
import type { ActiveSale, Market, PriceBand } from '../../types/contract';
import s from './map.module.css';
import BrandLogo from '../../components/common/BrandLogo';

/** 지도 화면 틀: 모바일은 지도 위 검색창과 바텀시트, PC(1024px↑)는 왼쪽 패널과 오른쪽 지도 */
export function MapLayout({
  desktop,
  map,
  top,
  panel,
  label,
  expanded,
  onExpandedChange,
  sheetless,
}: {
  desktop: boolean;
  map: ReactNode;
  top?: ReactNode;
  panel: ReactNode;
  label: string;
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  /** 지도 없이 패널만(오류 화면 등) */
  sheetless?: boolean;
}) {
  if (desktop)
    return (
      <div className={s.split}>
        <aside className={s.panel} aria-label={label}>
          {panel}
        </aside>
        <div className={s.mapSection}>{map}</div>
      </div>
    );
  return (
    <div className={s.stage}>
      <div className={s.mapArea}>{map}</div>
      {top && <div className={s.top}>{top}</div>}
      {sheetless ? (
        panel
      ) : (
        <BottomSheet
          label={label}
          className={s.sheet}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
        >
          <div className={s.sheetBody} data-sheet-scroll>
            {panel}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/** 지도 위 검색창(시안의 흰 면 54px). 입력은 /search 화면에서 받고 여기서는 그리로 가는 링크 */
export function SearchPill({
  back,
  backState,
  to,
  text,
  value,
  clear,
}: {
  back?: string;
  backState?: unknown;
  to: To;
  text: string;
  /** 검색한 품목 이름(굵게) */
  value?: string;
  clear?: string;
}) {
  const t = useT();
  return (
    <div className={s.pill}>
      {back ? (
        <Link to={back} state={backState} aria-label={t('mapBack')} className={s.pillIcon}>
          <Icon name="back" />
        </Link>
      ) : (
        // 시안: 지도 위 검색창 왼쪽은 Market-On 로고(막대 네 개)
        <span className={s.pillIcon}>
          <BrandLogo kind="mark" className={s.pillLogo} />
        </span>
      )}
      <Link to={to} className={value ? s.pillValue : s.pillText}>
        {value ? (
          <>
            <span className="sr-only">{text}: </span>
            {value}
          </>
        ) : (
          text
        )}
      </Link>
      {clear && (
        <Link to={clear} aria-label={t('mapClearSearch')} className={s.pillIcon}>
          <Icon name="close" />
        </Link>
      )}
      <NotificationBell />
      <Link to="/me" aria-label={t('mapMyInfo')} className={s.pillMe}>
        <span>
          <Icon name="user" size={20} />
        </span>
      </Link>
    </div>
  );
}

/** 시장 편의시설 유무(주차장, 공중화장실, 온누리상품권). 값이 없으면(live) 숨김 */
export function Amenities({ market }: { market: Market }) {
  const t = useT();
  const a = market.amenities;
  if (!a) return null;
  const rows = [
    a.parking && { icon: 'parking' as const, text: t('mapParking') },
    a.toilet && { icon: 'toilet' as const, text: t('mapToilet') },
    a.onnuri && { icon: 'card' as const, text: t('mapOnnuri') },
  ].filter(Boolean) as { icon: 'parking' | 'toilet' | 'card'; text: string }[];
  if (!rows.length) return null;
  return (
    <ul className={s.amenities} aria-label={t('mapAmenities')}>
      {rows.map((r) => (
        <li key={r.icon}>
          <Icon name={r.icon} size={18} />
          {r.text}
        </li>
      ))}
    </ul>
  );
}

/** 시장 점포 목록의 한 줄(시안 MarketSheet). 누르면 점포 화면 */
export function StoreLinkRow({ view, to }: { view: StoreView; to: string }) {
  const t = useT();
  const { store } = view;
  return (
    <li>
      <Link to={to} className={s.row}>
        <CategoryBadge category={view.category} size={44} />
        <span className={s.rowBody}>
          <span className={s.rowTitle}>{store.name}</span>
          <span className={s.rowSub}>{storeSub(view, t) || store.hours}</span>
        </span>
        <span className={s.rowEnd}>
          {store.active_sale ? (
            <Tag tone="todo">{t('closingBadge')}</Tag>
          ) : store.verified ? (
            <Tag>{t('mapVerified')}</Tag>
          ) : null}
          <Icon name="chevronRight" size={20} />
        </span>
      </Link>
    </li>
  );
}

/** 품목 검색 결과의 한 줄(시안 WebHome 목록). 누르면 그 점포를 지도에서 고름 */
export function StoreResultRow({
  view,
  itemName,
  selected,
  onSelect,
}: {
  view: StoreView;
  itemName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const { store } = view;
  const sale = store.active_sale;
  const guessed = store.guessed_item_ids.length > 0;
  return (
    <li>
      <button type="button" className={s.row} aria-pressed={selected} onClick={onSelect}>
        <CategoryBadge category={view.category} size={44} />
        <span className={s.rowBody}>
          <span className={s.rowTitle}>{store.name}</span>
          {sale ? (
            <span className={s.rowSale}>
              {fill(t('mapSaleUntil'), { time: saleTime(sale.ends_at) })}
            </span>
          ) : (
            <span className={s.rowSub}>
              {guessed ? t('mapGuessed') : storeSub(view, t, false) || store.hours}
            </span>
          )}
        </span>
        {(sale || store.price) && (
          <span className={s.rowPriceStack}>
            <span className={s.price16}>
              {formatPrice(sale ? sale.sale_price : store.price!.price)}
            </span>
            {!sale && store.price && (
              // 두 줄로: "사과 1개" / "시장 평균 · aT 11월 25일 조사"(세 줄로 쌓여 비좁던 것)
              <span className={s.rowUnit}>
                <span>
                  {itemName} {unitLabel(store.price.unit)}
                </span>
                {store.price.source === 'market_avg' && <span>{priceWho(store.price, t)}</span>}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

/** 고른 점포 카드(시안 SearchResult의 signal-soft 면). 길 안내가 이 화면의 주요 버튼 */
export function SelectedStoreCard({
  view,
  itemName,
  band,
  storeHref,
  onRoute,
}: {
  view: StoreView;
  itemName?: string;
  band: PriceBand | null;
  storeHref: string;
  onRoute: () => void;
}) {
  const t = useT();
  const { store } = view;
  const price = store.price;
  const sub = storeSub(view, t, false);
  return (
    <section className={s.selected} aria-label={fill(t('mapSelectedStore'), { name: store.name })}>
      <div className={s.selectedHead}>
        <CategoryBadge category={view.category} size={48} />
        <div className={s.selectedBody}>
          <div className={s.selectedName}>
            <h2>{store.name}</h2>
            {store.verified && <Tag>{t('mapVerified')}</Tag>}
          </div>
          <span className={s.rowSub}>
            {sub || (view.category ? CATEGORY_LABELS[view.category] : store.hours)}
          </span>
          {store.guessed_item_ids.length > 0 && <span className={s.rowSub}>{t('mapGuessed')}</span>}
        </div>
        {itemName && price && (
          <div className={s.selectedPrice}>
            <span className={s.priceLine}>
              <span className={s.price18}>{formatPrice(price.price)}</span>
              <MiniGauge band={band} />
            </span>
            <span className={s.priceCaption}>
              {itemName} {unitLabel(price.unit)},{' '}
              {price.source === 'market_avg'
                ? priceWho(price, t)
                : price.source === 'merchant'
                  ? t('mapMerchantChecked')
                  : fill(t('mapCustomersChecked'), { count: price.reporters })}
            </span>
          </div>
        )}
      </div>
      <ReviewSummary key={store.store_id} storeId={store.store_id} to={storeHref} />
      <FavoriteButton
        key={`favorite-${store.store_id}`}
        storeId={store.store_id}
        name={store.name}
        marketId={new URL(storeHref, window.location.origin).searchParams.get('market') ?? ''}
      />
      {itemName && !price && <p className={s.rowSub}>{t('mapNoStorePrice')}</p>}
      <div className={s.buttons}>
        <Button
          variant="primary"
          size="md"
          grow
          onClick={onRoute}
          icon={<Icon name="navigate" size={18} />}
        >
          {t('mapRoute')}
        </Button>
        <ButtonLink to={storeHref} variant="outline" size="md" grow>
          {t('mapViewStore')}
        </ButtonLink>
      </div>
    </section>
  );
}

/** 마감세일 한 줄(시안 Sales). 보이면 조회 수를 셈 */
export function SaleRow({ sale, to }: { sale: ActiveSale; to: string }) {
  const t = useT();
  const ref = useSaleView(sale.id);
  const today = seoulDay(new Date(sale.ends_at)) === seoulDay();
  return (
    <li ref={ref as RefObject<HTMLLIElement | null>}>
      <Link to={to} className={s.saleRow}>
        <ItemTile itemId={sale.item_id} size={64} />
        <span className={s.rowBody}>
          <span className={s.saleStore}>{sale.store_name}</span>
          <span className={s.saleLine}>
            <span className={s.saleItem}>
              {sale.item_name} <span className={s.price17}>{formatPrice(sale.sale_price)}</span>
            </span>
            {sale.regular_price && (
              <span className={s.strike}>
                <span className="sr-only">{t('regularPrice')} </span>
                {formatPrice(sale.regular_price)}
              </span>
            )}
          </span>
          <span className={s.rowSale}>
            {fill(t(today ? 'mapUntilToday' : 'mapUntil'), { time: saleTime(sale.ends_at) })}
          </span>
        </span>
        <Icon name="chevronRight" size={20} />
      </Link>
    </li>
  );
}

/** 준비 중(listed) 시장 안내(시안 Request) */
export function RequestPanel({
  market,
  alternative,
  desktop,
}: {
  market: Market;
  alternative?: Market | null;
  desktop?: boolean;
}) {
  const t = useT();
  const demand = useResource(
    useCallback(() => getDemand(market.market_id).catch(() => null), [market.market_id]),
  );
  const action = useAction(() => requestMarket(market.market_id));
  const count = action.data ? action.data.requests_7d : (demand.data?.requests_7d ?? null);
  return (
    <div className={s.panelStack}>
      <div className={s.heading}>
        <h1 className={desktop ? s.titleWeb : s.title}>
          {fill(t('mapRequestTitle'), { name: josaPair(market.name, '은/는') })}
        </h1>
        <p className={s.lead}>
          {t('mapRequestLead')} {fill(t('mapRequestCount'), { people: people(count) })}
        </p>
      </div>
      <div className={s.stack10}>
        <Button
          variant="primary"
          wide
          disabled={action.loading || !!action.data}
          onClick={() => void action.run()}
        >
          {t('mapRequestButton')}
        </Button>
        {action.data && (
          <p role="status" className={s.center}>
            {fill(t('mapRequestDone'), { people: people(action.data.requests_7d) })}
          </p>
        )}
        {action.error && (
          <p role="alert" className={s.center}>
            {action.error}
          </p>
        )}
        <p className={s.note}>{t('mapRequestAnonymous')}</p>
      </div>
      {alternative && (
        <List>
          <li>
            <Link to={`/?market=${encodeURIComponent(alternative.market_id)}`} className={s.row}>
              <span className={s.rowBody}>
                <span className={s.rowTitle}>
                  {fill(t('mapRequestAlternative'), { name: josaPair(alternative.name, '은/는') })}
                </span>
                {alternative.distance_m !== null && (
                  <span className={s.rowSub}>
                    {alternative.distance_m <= 3000
                      ? fill(t('mapFromHereWalk'), {
                          minutes: walkMinutes(alternative.distance_m),
                        })
                      : formatDistance(alternative.distance_m)}
                  </span>
                )}
              </span>
              <Icon name="chevronRight" size={20} />
            </Link>
          </li>
        </List>
      )}
    </div>
  );
}

/** 지도를 불러오지 못했을 때(시안 Error). live에서 키 없음, SDK 실패, 인증 실패 */
export function MapError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className={s.errorScreen}>
      <div className={s.errorBox}>
        <div className={s.heading}>
          <h1 className={s.title}>{t('mapErrorTitle')}</h1>
          <p className={s.lead}>{t('mapErrorLead')}</p>
        </div>
        <div className={s.stack8}>
          <Button variant="primary" wide onClick={onRetry} icon={<Icon name="refresh" size={20} />}>
            {t('retry')}
          </Button>
          <ButtonLink to="/markets" variant="outline" wide>
            {t('mapErrorList')}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
