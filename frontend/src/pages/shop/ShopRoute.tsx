import { Link, useLocation } from 'react-router-dom';
import { useRequireMarket } from '../../hooks/useFlows';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import Icon from '../../components/common/Icon';
import { RouteList, RouteMap } from './route';
import { useShopRoute, type RouteState } from '../../hooks/useShopRoute';
import s from './shop.module.css';

/**
 * 장보기 동선(/shop/route?market=&item=a&item=b). 여러 품목을 가까운 순서로 돌고 산 곳을 체크.
 * 순서는 프런트에서 점포 위경도로 계산(utils/shopRoute). 좌표가 없으면(live) 목록 순서로만 보여 줌.
 */
export default function ShopRoute() {
  const t = useT();
  const ctx = useShoppingContext();
  const location = useLocation();
  const desktop = useIsDesktop();
  const nav = (location.state ?? {}) as RouteState;
  const itemIds = ctx.params.getAll('item');
  const route = useShopRoute(ctx.marketId ?? '', itemIds, nav.lines);
  const ready = useRequireMarket();
  if (!ready) return null;
  const label = t('shopRouteMap');
  const list = itemIds.length ? (
    <RouteList route={route} lines={nav.lines} total={nav.total} />
  ) : (
    <p className={s.note}>{t('shopRouteEmpty')}</p>
  );
  const back = (
    <Link to={ctx.href('/shop')} className={s.back} aria-label={t('shopBack')}>
      <Icon name="back" />
    </Link>
  );
  if (desktop)
    return (
      <div className={s.web}>
        <div className={s.webPanel}>
          <Link to={ctx.href('/shop')} className="text-link">
            {t('shopBack')}
          </Link>
          <h1 className={s.h1}>{t('shopRouteHeading')}</h1>
          {list}
        </div>
        <section className={s.webMap} aria-label={label}>
          <RouteMap route={route} label={label} />
        </section>
      </div>
    );
  return (
    <>
      <h1 className="sr-only">{t('shopRouteHeading')}</h1>
      <div className={s.routeMap}>
        {back}
        <RouteMap route={route} label={label} />
      </div>
      <section className={s.routeSheet} aria-label={t('shopRouteHeading')}>
        <div className={s.routeSheetInner}>
          <span className={s.grabber} aria-hidden="true" />
          {list}
        </div>
      </section>
    </>
  );
}
