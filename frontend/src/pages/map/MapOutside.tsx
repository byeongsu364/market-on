import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MapView from '../../components/map/MapView';
import Button, { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { List } from '../../components/common/parts';
import Loading from '../../components/common/Loading';
import ErrorBox from '../../components/common/ErrorBox';
import RouteSheet from '../../components/domain/RouteSheet';
import { useNearbyMarkets } from '../../hooks/useNearbyMarkets';
import { useActiveSales } from '../../hooks/useSales';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useSession } from '../../store/session';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { formatDistance, walkMinutes } from '../../utils/directions';
import { people } from '../../utils/people';
import type { Market } from '../../types/contract';
import { MapError, MapLayout, RequestPanel, SearchPill } from './parts';
import s from './map.module.css';

const ONBOARDED = 'map-onboarded';
const readOnboarded = () => {
  try {
    return localStorage.getItem(ONBOARDED) === '1';
  } catch {
    return false;
  }
};
const marketHref = (m: Market) => `/?market=${encodeURIComponent(m.market_id)}`;
const byDistance = (a: Market, b: Market) =>
  (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);

/** 지도 홈, 시장 밖(시안 Main · WebMain, 첫 방문 Onboard, 지도 실패 Error) */
export default function MapOutside() {
  const t = useT();
  const desktop = useIsDesktop();
  const session = useSession();
  // 위치를 이미 썼으면(시장 자동 선택이 주변 시장을 찾았으면) 첫 방문 안내를 건너뜀
  const [flag, setOnboarded] = useState(readOnboarded);
  const onboarded = flag || !!session.unsupported || !!session.nearbyActive;
  const nearby = useNearbyMarkets(onboarded);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<Market | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onFailure = useCallback(() => setFailed(true), []);
  const closeRoute = useCallback(() => setRoute(null), []);
  const markets = useMemo(
    () => [...(nearby.markets.data ?? [])].sort(byDistance),
    [nearby.markets.data],
  );
  const nearestActive = markets.find((m) => m.status === 'active') ?? null;
  const fallback =
    (session.unsupported && markets.find((m) => m.market_id === session.unsupported?.market_id)) ||
    session.unsupported ||
    nearestActive ||
    markets[0] ||
    null;
  const selected = markets.find((m) => m.market_id === selectedId) ?? fallback;
  const located = nearby.position !== undefined;
  const denied = onboarded && nearby.position === null;
  const startLocating = () => {
    try {
      localStorage.setItem(ONBOARDED, '1');
    } catch {
      /* 이번 방문에만 */
    }
    setOnboarded(true);
  };

  const top = <SearchPill to="/search" text={t('mapSearchMarketOrItem')} />;
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

  const map = (
    <MapView
      key={attempt}
      label={t('mapAroundLabel')}
      markets={markets.map((m) => ({
        id: m.market_id,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        active: m.status === 'active',
      }))}
      me={nearby.position ?? null}
      center={nearby.position ?? undefined}
      onSelect={(id, type) => {
        if (type !== 'market') return;
        setSelectedId(id);
      }}
      topInset={desktop ? 0 : 72}
      bottomInset={desktop ? 0 : 260}
      onFailure={onFailure}
    />
  );

  let panel;
  if (!onboarded && !desktop) {
    panel = (
      <div className={s.panelStack20}>
        <div className={s.heading}>
          <h1 className={s.title}>{t('mapOnboardTitle')}</h1>
          <p className={s.lead}>{t('mapOnboardLead')}</p>
        </div>
        <div className={s.stack8}>
          <Button
            variant="primary"
            wide
            onClick={startLocating}
            icon={<Icon name="locate" size={20} />}
          >
            {t('mapOnboardUse')}
          </Button>
          <ButtonLink to="/markets" variant="surface" wide>
            {t('mapPickMarket')}
          </ButtonLink>
        </div>
      </div>
    );
  } else if (desktop) {
    panel = (
      <WebMarketList
        markets={markets}
        loading={nearby.markets.loading || (onboarded && !located)}
        error={nearby.markets.error}
        retry={nearby.markets.retry}
        located={located && !!nearby.position}
        onLocate={onboarded ? nearby.locate : startLocating}
      />
    );
  } else if (nearby.markets.loading || (onboarded && !located)) {
    panel = <Loading message={t('locating')} />;
  } else if (nearby.markets.error) {
    panel = (
      <div className={s.panelStack14}>
        <ErrorBox message={nearby.markets.error} retry={nearby.markets.retry} />
        <ButtonLink to="/markets" variant="surface" wide>
          {t('mapErrorList')}
        </ButtonLink>
      </div>
    );
  } else if (denied) {
    panel = (
      <div className={s.panelStack20}>
        <div className={s.heading}>
          <h1 className={s.title}>{t('mapDeniedTitle')}</h1>
          <p className={s.lead}>{t('mapDeniedLead')}</p>
        </div>
        <ButtonLink to="/markets" variant="primary" wide>
          {t('mapErrorList')}
        </ButtonLink>
      </div>
    );
  } else if (!selected) {
    panel = (
      <div className={s.panelStack20}>
        <div className={s.heading}>
          <h1 className={s.title}>{t('mapNoNearbyTitle')}</h1>
          <p className={s.lead}>{t('mapNoNearbyLead')}</p>
        </div>
        <ButtonLink to="/markets" variant="primary" wide>
          {t('mapErrorList')}
        </ButtonLink>
      </div>
    );
  } else if (selected.status === 'listed') {
    panel = (
      <RequestPanel
        key={selected.market_id}
        market={selected}
        alternative={session.nearbyActive ?? nearestActive}
      />
    );
  } else {
    panel = <MarketSummary market={selected} onRoute={() => setRoute(selected)} />;
  }

  return (
    <>
      <h1 className="sr-only">{t('mapHomeTitle')}</h1>
      <MapLayout
        desktop={desktop}
        label={t('mapAroundPanel')}
        map={map}
        top={top}
        panel={panel}
        expanded={false}
      />
      {route && (
        <RouteSheet destination={route} kind="market" me={nearby.position} onClose={closeRoute} />
      )}
    </>
  );
}

/** 가장 가까운(또는 고른) 시장 카드(시안 Main 시트) */
function MarketSummary({ market, onRoute }: { market: Market; onRoute: () => void }) {
  const t = useT();
  const sales = useActiveSales(market.market_id);
  const saleStores = new Set(sales.data?.map((x) => x.store_id)).size;
  const d = market.distance_m;
  return (
    <div className={s.panelStack14}>
      <div className={s.summaryHead}>
        <div className={s.summaryName}>
          <h2 className={s.title24}>{market.name}</h2>
          {market.address && <span className={s.sub14}>{market.address}</span>}
        </div>
        {d !== null && (
          <div className={s.summaryDistance}>
            {d <= 3000 && (
              <span className={s.walk}>{fill(t('mapWalk'), { minutes: walkMinutes(d) })}</span>
            )}
            <span className={s.meters}>{formatDistance(d)}</span>
          </div>
        )}
      </div>
      {(market.store_count != null || saleStores > 0) && (
        <p className={s.body15}>
          {market.store_count != null && fill(t('mapStoreCount'), { count: market.store_count })}
          {market.store_count != null && saleStores > 0 && ' '}
          {saleStores > 0 && fill(t('mapSaleNow'), { count: saleStores })}
        </p>
      )}
      <div className={s.buttons}>
        <ButtonLink to={marketHref(market)} variant="primary" grow>
          {t('mapExplore')}
        </ButtonLink>
        <Button variant="surface" onClick={onRoute} icon={<Icon name="navigate" size={20} />}>
          {t('mapRoute')}
        </Button>
      </div>
    </div>
  );
}

/** PC 왼쪽 패널: 가까운 전통시장 목록(시안 WebMain) */
function WebMarketList({
  markets,
  loading,
  error,
  retry,
  located,
  onLocate,
}: {
  markets: Market[];
  loading: boolean;
  error: string;
  retry: () => void;
  located: boolean;
  onLocate: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className={s.heading6}>
        <h1 className={s.titleWeb}>{t('mapNearbyTitle')}</h1>
        <span className={s.sub15}>{located ? t('mapNearbyLead') : t('mapNearbyNoLocation')}</span>
      </div>
      {!located && !loading && (
        <div className={s.locateBox}>
          <span className={s.locateText}>{t('mapLocateHint')}</span>
          <Button variant="outline" size="sm" onClick={onLocate}>
            {t('mapLocateOn')}
          </Button>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={retry} />
      ) : (
        <List label={t('mapNearbyTitle')}>
          {markets.map((m) => (
            <li key={m.market_id}>
              <Link to={marketHref(m)} className={s.row72}>
                <span className={s.rowBody}>
                  <span className={s.rowTitle}>{m.name}</span>
                  <span className={s.rowSub}>
                    {[
                      m.address,
                      m.distance_m !== null &&
                        (m.distance_m <= 3000
                          ? fill(t('mapWalk'), { minutes: walkMinutes(m.distance_m) })
                          : formatDistance(m.distance_m)),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                <span className={s.rowEnd}>
                  {m.status === 'active' ? (
                    <span className={s.available}>{t('mapAvailable')}</span>
                  ) : (
                    <span className={s.preparing}>
                      {m.requests != null
                        ? fill(t('mapPreparingCount'), { people: people(m.requests) })
                        : t('mapPreparing')}
                    </span>
                  )}
                  <Icon name="chevronRight" size={20} />
                </span>
              </Link>
            </li>
          ))}
        </List>
      )}
      <p className={s.note}>{t('mapListedHint')}</p>
    </>
  );
}
