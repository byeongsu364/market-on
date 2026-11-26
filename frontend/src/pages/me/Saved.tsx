import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import AppHeader from '../../components/layout/AppHeader';
import Icon from '../../components/common/Icon';
import { CategoryBadge, List, Toggle } from '../../components/common/parts';
import Resource from '../../components/common/Resource';
import { useResource } from '../../hooks/useResource';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useActiveSales } from '../../hooks/useSales';
import {
  favoritesAvailable,
  saveFavorite,
  enablePush,
  getFavorites,
  getNotifySettings,
  saveNotifySettings,
  type NotifySettings,
} from '../../api/favorites';
import { getMarketMap } from '../../api/stores';
import { getMarkets } from '../../api/markets';
import { useT } from '../../i18n';
import { fill } from '../../utils/josa';
import { formatPrice } from '../../utils/formatPrice';
import { CATEGORY_LABELS, storeCategory } from '../../utils/category';
import type { Favorite, StoreCategory } from '../../types/contract';
import s from '../map/map.module.css';

type Row = Favorite & { category: StoreCategory | null; marketName: string; open?: boolean | null };

/** 계정에 저장한 단골 점포와 알림 설정. */
export default function Saved() {
  const t = useT();
  const desktop = useIsDesktop();
  const { user } = useAuth();
  return (
    <>
      {!desktop && <AppHeader back="/me" />}
      <div className="page">
        <div className={s.heading}>
          <h1 className={desktop ? s.titleWeb : s.title}>{t('mapSavedTitle')}</h1>
          <p className={s.lead}>{favoritesAvailable ? t('mapSavedLead') : t('mapSavedLater')}</p>
        </div>
        {user?.role === 'customer' ? (
          <SavedBody />
        ) : (
          <p>
            로그인하면 단골을 저장할 수 있어요 <Link to="/login?next=%2Fme%2Fsaved">로그인</Link>
          </p>
        )}
      </div>
    </>
  );
}

function SavedBody() {
  const t = useT();
  const sales = useActiveSales();
  const rows = useResource(
    useCallback(async (): Promise<Row[]> => {
      const favorites = await getFavorites();
      if (!favorites.length) return [];
      const markets = await getMarkets().catch(() => []);
      const ids = [...new Set(favorites.map((f) => f.market_id))];
      const maps = await Promise.all(ids.map((id) => getMarketMap(id).catch(() => null)));
      return favorites.map((f) => {
        const map = maps[ids.indexOf(f.market_id)];
        const store = map?.stores.find((x) => x.store_id === f.store_id);
        return {
          ...f,
          marketName: markets.find((m) => m.market_id === f.market_id)?.name ?? '',
          category: store
            ? storeCategory(store, map?.zones.find((z) => z.id === store.zone_id)?.name)
            : null,
          open: store?.open_now,
        };
      });
    }, []),
  );
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState<NotifySettings | null>(null);
  useEffect(() => {
    let active = true;
    void getNotifySettings()
      .then((v) => active && setSettings(v))
      .catch(() => active && setMessage('알림 설정을 불러오지 못했어요.'));
    return () => {
      active = false;
    };
  }, []);
  const change = (next: NotifySettings) => {
    void saveNotifySettings(next)
      .then(setSettings)
      .catch(() => setMessage('알림 설정을 저장하지 못했어요.'));
  };
  return (
    <>
      <Resource state={rows}>
        {rows.data?.length ? (
          <List label={t('mapSavedTitle')}>
            {rows.data.map((f) => {
              const sale = sales.data?.find((x) => x.store_id === f.store_id);
              return (
                <li key={f.store_id}>
                  <Link
                    to={`/s/${encodeURIComponent(f.store_id)}?market=${encodeURIComponent(f.market_id)}`}
                    className={s.row76}
                  >
                    <CategoryBadge category={f.category} size={48} />
                    <span className={s.rowBody}>
                      <span className={s.rowTitle}>{f.name}</span>
                      {sale ? (
                        <span className={s.rowSale}>
                          {fill(t('mapSavedSale'), {
                            item: sale.item_name,
                            price: formatPrice(sale.sale_price),
                          })}
                        </span>
                      ) : (
                        <span className={s.rowSub}>
                          {[
                            f.marketName,
                            f.category && CATEGORY_LABELS[f.category],
                            f.open === true && t('mapOpenNow'),
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      )}
                    </span>
                    <Icon name="chevronRight" size={20} />
                  </Link>
                  <Toggle
                    label={`${f.name} 알림`}
                    checked={f.notify}
                    onChange={(notify) => {
                      void saveFavorite(f, notify)
                        .then(() => rows.retry())
                        .catch(() => setMessage('점포 알림을 저장하지 못했어요.'));
                    }}
                  />
                </li>
              );
            })}
          </List>
        ) : (
          <p className={s.lead}>{t('mapSavedEmpty')}</p>
        )}
      </Resource>
      <section aria-labelledby="saved-notify">
        <h2 id="saved-notify" className={s.h2Row}>
          {t('mapNotifyTitle')}
        </h2>
        {settings && (
          <List>
            <li className={s.toggleRow}>
              <span className={s.rowBody}>
                <span className={s.rowTitle}>{t('mapNotifySales')}</span>
                <span className={s.rowSub}>{t('mapNotifySalesSub')}</span>
              </span>
              <Toggle
                label={t('mapNotifySalesLabel')}
                checked={settings.sales}
                onChange={(v) => change({ ...settings, sales: v })}
              />
            </li>
            <li className={s.toggleRow}>
              <span className={s.rowBody}>
                <span className={s.rowTitle}>{t('mapNotifySeason')}</span>
                <span className={s.rowSub}>{t('mapNotifySeasonSub')}</span>
              </span>
              <Toggle
                label={t('mapNotifySeasonLabel')}
                checked={settings.season}
                onChange={(v) => change({ ...settings, season: v })}
              />
            </li>
          </List>
        )}
        <p className={s.note}>{t('mapNotifyNote')}</p>
        <button
          type="button"
          onClick={() => {
            void enablePush()
              .then(() => setMessage('알림을 받을 준비가 됐어요.'))
              .catch((e: Error) => setMessage(e.message));
          }}
        >
          알림 받기
        </button>
        <p role="status">{message}</p>
      </section>
    </>
  );
}
