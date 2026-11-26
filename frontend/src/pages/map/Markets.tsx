import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppHeader from '../../components/layout/AppHeader';
import Button from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import { List, SearchBar } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import { useMarkets } from '../../hooks/useMarkets';
import { usePosition } from '../../hooks/usePosition';
import { useMarketChoice } from '../../hooks/useFlows';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { formatDistance, walkMinutes } from '../../utils/directions';
import type { Market } from '../../types/contract';
import s from './map.module.css';

/** 시장 고르기(시안 Markets). 위치를 거부했거나 지도를 못 불러올 때도 여기로 옴 */
export default function Markets() {
  const t = useT();
  const desktop = useIsDesktop();
  const location = useLocation();
  const { position, locate } = usePosition();
  const markets = useMarkets(position?.lat, position?.lng);
  const choose = useMarketChoice();
  const [q, setQ] = useState('');
  const from = (location.state as { from?: string } | null)?.from;
  const list = useMemo(
    () =>
      (markets.data ?? [])
        .filter((m) => !q.trim() || m.name.includes(q.trim()))
        .sort(
          (a, b) =>
            Number(a.status === 'listed') - Number(b.status === 'listed') ||
            (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity),
        ),
    [markets.data, q],
  );
  const sub = (m: Market) =>
    [
      m.address,
      m.store_count != null && fill(t('mapFoodStores'), { count: m.store_count }),
      m.distance_m !== null &&
        (m.distance_m <= 3000
          ? fill(t('mapWalk'), { minutes: walkMinutes(m.distance_m) })
          : formatDistance(m.distance_m)),
    ]
      .filter(Boolean)
      .join(', ');
  return (
    <>
      {!desktop && <AppHeader title={t('mapMarketsTitle')} back={from ? undefined : '/'} />}
      <div className="page">
        {desktop && <h1 className={s.titleWeb}>{t('mapMarketsTitle')}</h1>}
        <div className={s.stack16}>
          <SearchBar
            label={t('mapMarketSearch')}
            placeholder={t('mapMarketSearch')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {position === null && (
            <div className={s.locateBox}>
              <span className={s.locateText}>{t('mapLocateHint')}</span>
              <Button variant="outline" size="sm" onClick={locate}>
                {t('mapLocateOn')}
              </Button>
            </div>
          )}
          <Resource state={markets}>
            <List label={t('mapMarketsTitle')}>
              {list.map((m) =>
                m.status === 'active' ? (
                  <li key={m.market_id}>
                    <button type="button" className={s.row72} onClick={() => choose(m)}>
                      <span className={s.rowBody}>
                        <span className={s.rowTitle}>{m.name}</span>
                        {sub(m) && <span className={s.rowSub}>{sub(m)}</span>}
                      </span>
                      <span className={s.rowEnd}>
                        <span className={s.available}>{t('mapAvailable')}</span>
                        <Icon name="chevronRight" size={20} />
                      </span>
                    </button>
                  </li>
                ) : (
                  <li key={m.market_id}>
                    <Link to={`/?market=${encodeURIComponent(m.market_id)}`} className={s.row72}>
                      <span className={s.rowBody}>
                        <span className={s.rowTitle}>{m.name}</span>
                        {sub(m) && <span className={s.rowSub}>{sub(m)}</span>}
                      </span>
                      <span className={s.rowEnd}>
                        <span className={s.preparing}>{t('mapPreparing')}</span>
                        <Icon name="chevronRight" size={20} />
                      </span>
                    </Link>
                  </li>
                ),
              )}
            </List>
            {!list.length && <p className={s.lead}>{t('mapNoMarketMatch')}</p>}
          </Resource>
          <p className={s.noteTop}>{t('mapListedHint')}</p>
        </div>
      </div>
    </>
  );
}
