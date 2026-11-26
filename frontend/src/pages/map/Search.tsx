import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { ButtonLink } from '../../components/common/Button';
import { ChipLink } from '../../components/common/Chip';
import { ItemTile, List } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useItemCatalog } from '../../hooks/useFlows';
import { useMarkets } from '../../hooks/useMarkets';
import { useResource } from '../../hooks/useResource';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { getMarketItems } from '../../api/markets';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { formatPrice } from '../../utils/formatPrice';
import type { Item } from '../../types/contract';
import { parseSearch } from './helpers';
import s from './map.module.css';

const RECENT = 'recent-items';
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
};
const saveRecent = (id: string) => {
  try {
    localStorage.setItem(RECENT, JSON.stringify([id, ...readRecent().filter((x) => x !== id)]));
  } catch {
    /* 기록 없이 진행 */
  }
};

const matchesName = (item: Item, name: string) => {
  const q = name.toLowerCase();
  return [item.name, ...item.synonyms].some((n) => n.toLowerCase().includes(q));
};

/**
 * 품목 검색(시안 Search, SearchEmpty). 이름만 넣으면 지도에서 파는 점포를 강조하고,
 * 가격까지 넣으면("사과 2300") 결과 화면으로 감(가격은 이동 상태로만). PC 머리말 검색창의 `q`도 받음.
 */
export default function Search() {
  const t = useT();
  const desktop = useIsDesktop();
  const ctx = useShoppingContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setQ(params.get('q') ?? '');
  }, [params]);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const marketId = ctx.marketId;
  const marketName = ctx.market?.name;
  const catalog = useItemCatalog();
  const markets = useMarkets();
  const marketItems = useResource(
    useCallback(() => (marketId ? getMarketItems(marketId) : Promise.resolve(null)), [marketId]),
  );
  const recent = readRecent();
  const { name, price } = parseSearch(q);
  // 가나다순. 서버 DB 정렬(en_US)을 그대로 쓰면 "배, 단감, 대파, 사과"처럼 섞여 나왔음(2026-11-27)
  const all = [...(catalog.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const sold = marketItems.data
    ? all.filter((i) => marketItems.data!.some((m) => m.item_id === i.item_id))
    : all;
  const count = (id: string) => marketItems.data?.find((m) => m.item_id === id)?.store_count;
  const matches = name ? all.filter((i) => matchesName(i, name)) : [];
  const marketMatches =
    name && !matches.length
      ? (markets.data ?? []).filter((m) => m.name.includes(name)).slice(0, 5)
      : [];
  const label = marketName ? fill(t('mapSearchIn'), { name: marketName }) : t('mapSearchItem');

  const target = (item: Item) => {
    if (!marketId) return { to: '/markets', state: { from: ctx.href('/search', {}, { q }) } };
    if (price)
      return {
        to: ctx.href(`/items/${encodeURIComponent(item.item_id)}`, { market: marketId }),
        state: { price, quantity: 1, unit: item.default_unit, method: 'manual' as const },
      };
    return { to: ctx.href('/', { market: marketId, item: item.item_id }), state: undefined };
  };
  const go = (item: Item) => {
    saveRecent(item.item_id);
    const { to, state } = target(item);
    navigate(to, { state });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (matches[0]) go(matches[0]);
  };
  const back = marketId ? ctx.href('/', { market: marketId }) : '/';

  const itemRow = (item: Item) => {
    const { to, state } = target(item);
    const n = count(item.item_id);
    return (
      <li key={item.item_id}>
        <Link to={to} state={state} className={s.row} onClick={() => saveRecent(item.item_id)}>
          <ItemTile itemId={item.item_id} size={44} />
          <span className={s.rowBody}>
            <span className={s.rowTitle}>
              {price ? `${item.name} ${formatPrice(price)}` : item.name}
            </span>
            {price && <span className={s.rowSub}>{t('mapSearchWithPrice')}</span>}
          </span>
          <span className={s.rowEnd}>
            {n != null && <span className={s.countEnd}>{fill(t('mapCount'), { count: n })}</span>}
            <Icon name="chevronRight" size={20} />
          </span>
        </Link>
      </li>
    );
  };

  const empty = !!name && catalog.data && !matches.length;
  return (
    <div className={desktop ? s.searchPageWeb : s.searchPage}>
      <form role="search" className={s.searchForm} onSubmit={submit}>
        <div className={s.searchBox}>
          <Link to={back} aria-label={t('mapBack')} className={s.pillIcon}>
            <Icon name="back" />
          </Link>
          <label htmlFor="map-search" className="sr-only">
            {label}
          </label>
          <input
            ref={input}
            id="map-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={label}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={s.searchInput}
          />
          {q && (
            <button
              type="button"
              aria-label={t('mapClearSearch')}
              className={s.pillIcon}
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </form>
      <div className={s.searchMain}>
        <h1 className="sr-only">{t('mapSearchTitle')}</h1>
        {!name && <p className={s.searchHint}>{t('mapSearchHint')}</p>}
        <Resource state={catalog}>
          {empty ? (
            <>
              {marketMatches.length > 0 && (
                <section className={s.stack6} aria-labelledby="map-market-results">
                  <h2 id="map-market-results" className={s.label14}>
                    {t('mapMarketResults')}
                  </h2>
                  <List>
                    {marketMatches.map((m) => (
                      <li key={m.market_id}>
                        <Link to={`/?market=${encodeURIComponent(m.market_id)}`} className={s.row}>
                          <span className={s.rowBody}>
                            <span className={s.rowTitle}>{m.name}</span>
                          </span>
                          <span className={s.rowEnd}>
                            <span className={m.status === 'active' ? s.available : s.preparing}>
                              {m.status === 'active' ? t('mapAvailable') : t('mapPreparing')}
                            </span>
                            <Icon name="chevronRight" size={20} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </List>
                </section>
              )}
              {!marketMatches.length && (
                <div className={s.heading}>
                  <h2 className={s.title}>{fill(t('mapSearchEmptyTitle'), { name })}</h2>
                  <p className={s.lead}>{fill(t('mapSearchEmptyLead'), { count: sold.length })}</p>
                </div>
              )}
              {marketId && !marketMatches.length && (
                <ButtonLink
                  to={ctx.href('/', { market: marketId })}
                  variant="primary"
                  wide
                  icon={<Icon name="map" size={20} />}
                >
                  {marketName
                    ? fill(t('mapSearchEmptyMap'), { name: marketName })
                    : t('mapShowMap')}
                </ButtonLink>
              )}
              <section className={s.stack6} aria-labelledby="map-available">
                <h2 id="map-available" className={s.label14}>
                  {t('mapSearchAvailable')}
                </h2>
                <div className={s.chipWrap}>
                  {sold.map((item) => {
                    const { to, state } = target(item);
                    return (
                      <ChipLink
                        key={item.item_id}
                        to={to}
                        state={state}
                        icon={<ItemTile itemId={item.item_id} size={20} />}
                      >
                        {item.name}
                      </ChipLink>
                    );
                  })}
                </div>
              </section>
            </>
          ) : name ? (
            <List label={t('mapSearchMatches')}>{matches.map(itemRow)}</List>
          ) : (
            <>
              {recent.length > 0 && (
                <section className={s.stack6} aria-labelledby="map-recent">
                  <h2 id="map-recent" className={s.label14}>
                    {t('mapSearchRecent')}
                  </h2>
                  <div className={s.chipWrap}>
                    {recent
                      .map((id) => all.find((i) => i.item_id === id))
                      .filter((i): i is Item => !!i)
                      .map((item) => {
                        const { to, state } = target(item);
                        return (
                          <ChipLink
                            key={item.item_id}
                            to={to}
                            state={state}
                            icon={<Icon name="clock" size={18} />}
                          >
                            {item.name}
                          </ChipLink>
                        );
                      })}
                  </div>
                </section>
              )}
              <section className={s.stack6} aria-labelledby="map-sold">
                <h2 id="map-sold" className={s.label14}>
                  {marketName
                    ? fill(t('mapSearchSoldIn'), { name: marketName })
                    : t('mapSearchAll')}
                </h2>
                {!marketId && (
                  <p className={s.lead}>
                    <Link to="/markets" state={{ from: '/search' }} className="text-link">
                      {t('chooseMarket')}
                    </Link>
                  </p>
                )}
                <List>{sold.map(itemRow)}</List>
              </section>
            </>
          )}
        </Resource>
        <Link to={ctx.href('/scan', { store: ctx.storeId })} className={s.scanCard}>
          <span className={s.scanIcon}>
            <Icon name="camera" size={22} />
          </span>
          <span className={s.rowBody}>
            <span className={s.rowTitle}>{t('mapSearchScan')}</span>
            <span className={s.rowSub}>{t('mapSearchScanSub')}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </Link>
      </div>
    </div>
  );
}
