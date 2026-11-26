import { isMock } from '../../api/client';
import { type ShopLine, type ShopRouteState } from '../../hooks/useShopRoute';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useT } from '../../i18n';
import { ButtonLink } from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import MapView, { type MapPin, type MapStop } from '../../components/map/MapView';
import { storeCategory } from '../../utils/category';
import { formatPrice } from '../../utils/formatPrice';
import s from './shop.module.css';

/** "이 순서로 돌면 가까워요" 목록. 체크하면 산 곳으로 낮춤 */
export function RouteList({
  route,
  lines,
  total,
}: {
  route: ShopRouteState;
  lines?: ShopLine[];
  total?: number;
}) {
  const t = useT();
  const ctx = useShoppingContext();
  const next = route.remaining[0];
  const label = (id: string) => {
    const line = lines?.find((l) => l.item_id === id);
    return line ? `${line.name} ${line.quantity}${line.unit_label}` : route.nameOf(id);
  };
  if (route.map.loading) return <p className={s.note}>{t('loadingStatus')}</p>;
  if (route.map.error)
    return (
      <p role="alert" className={s.note}>
        {route.map.error}
      </p>
    );
  return (
    <section className={s.route} aria-labelledby="route-title">
      <div className={s.planHead}>
        <div>
          <h2 className={s.h2} id="route-title">
            {route.located ? t('shopRouteTitle') : t('shopRouteTitleList')}
          </h2>
          <span className={s.sub}>
            {route.remaining.length === 0
              ? t('shopRouteAllDone')
              : route.minutes != null
                ? t('shopRouteLeftWalk')
                    .replace('{n}', String(route.remaining.length))
                    .replace('{min}', String(route.minutes))
                : t('shopRouteLeft').replace('{n}', String(route.remaining.length))}
          </span>
        </div>
        {total != null && <span className={s.totalSm}>{formatPrice(total)}</span>}
      </div>
      <div>
        {route.stops.map((stop, i) => {
          const done = route.done.includes(stop.store.store_id);
          return (
            <label className={s.stop} key={stop.store.store_id} data-done={done}>
              <span className={s.order} aria-hidden="true">
                {i + 1}
              </span>
              <span className={s.stopBody}>
                <span className={s.stopTitle}>
                  <span className="sr-only">
                    {t('shopRouteOrder').replace('{n}', String(i + 1))}{' '}
                  </span>
                  {stop.item_ids.map(label).join(', ')}
                </span>
                <span className={s.stopSub}>{stop.store.name}</span>
              </span>
              <span className={s.bought}>{t('shopBought')}</span>
              <input
                type="checkbox"
                checked={done}
                onChange={() => route.toggle(stop.store.store_id)}
              />
            </label>
          );
        })}
      </div>
      {route.missing.length > 0 && (
        <p className={s.note}>
          {t('shopRouteMissing').replace('{items}', route.missing.join(', '))}
        </p>
      )}
      {!route.located && route.stops.length > 0 && (
        <p className={s.note}>{t('shopRouteNoLocation')}</p>
      )}
      {lines && <p className={s.note}>{t('shopPlanNote')}</p>}
      {next && (
        <ButtonLink
          variant="primary"
          wide
          icon={<Icon name="navigate" size={20} />}
          to={ctx.href('/', { store: next.store.store_id, item: next.item_ids[0] })}
        >
          {t('shopRouteNext')}
        </ButtonLink>
      )}
    </section>
  );
}

/** 동선 지도: 순서 번호, 지나는 선, 나머지 점포는 회색 점 */
export function RouteMap({ route, label }: { route: ShopRouteState; label: string }) {
  const data = route.data;
  if (!data || !route.located) return null;
  const stopIds = new Set(route.stops.map((st) => st.store.store_id));
  const stops: MapStop[] = route.stops.map((st, i) => ({
    id: st.store.store_id,
    order: i + 1,
    done: route.done.includes(st.store.store_id),
    name: st.store.name,
    lat: st.store.lat!,
    lng: st.store.lng!,
  }));
  const pins: MapPin[] = data.stores
    .filter((st) => !stopIds.has(st.store_id) && st.lat != null && st.lng != null)
    .map((st) => ({
      id: st.store_id,
      name: st.name,
      lat: st.lat!,
      lng: st.lng!,
      category: storeCategory(st, data.zones.find((z) => z.id === st.zone_id)?.name),
      state: 'dim',
    }));
  return (
    <MapView
      label={label}
      boundary={data.boundary}
      facilities={data.facilities}
      pins={pins}
      stops={stops}
      route={[
        ...(route.start ? [route.start] : []),
        ...stops.map(({ lat, lng }) => ({ lat, lng })),
      ]}
      sample={isMock}
    />
  );
}
