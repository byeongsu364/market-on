import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api/merchant';
import { useResource, useAction } from '../../hooks/useResource';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useMarket } from '../../hooks/useMarkets';
import MapView, { type MapPin } from '../../components/map/MapView';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import ErrorBox from '../../components/common/ErrorBox';
import Icon from '../../components/common/Icon';
import AppHeader from '../../components/layout/AppHeader';
import { storeCategory } from '../../utils/category';
import type { LatLng } from '../../types/contract';
import { useT } from '../../i18n';
import { isMock } from '../../api/client';
import { fill } from './format';
import s from './merchant.module.css';

// 한 번 누를 때 옮기는 거리(m). 위도 1도 ≈ 111km, 경도 1도 ≈ 88km(위도 37.5도)
const STEP = 3;
const moves = [
  { key: 'merchantPinUp', icon: 'chevronRight', rotate: -90, d: [0, 1] },
  { key: 'merchantPinDown', icon: 'chevronRight', rotate: 90, d: [0, -1] },
  { key: 'merchantPinLeft', icon: 'back', rotate: 0, d: [-1, 0] },
  { key: 'merchantPinRight', icon: 'chevronRight', rotate: 0, d: [1, 0] },
] as const;

export default function StorePin() {
  const t = useT();
  const navigate = useNavigate();
  const store = useResource(api.getStore);
  const extras = useResource(api.getExtras);
  const marketDetail = useMarket(store.data?.market_id ?? '');
  const map = useMarketMap(store.data?.market_id ?? '');
  const [moved, setMoved] = useState<LatLng | null>(null);
  const save = useAction(api.saveLocation);
  const market = marketDetail.data?.name ?? '';
  const center = marketDetail.data;
  const point = useMemo(
    () => moved ?? extras.data?.location ?? (center ? { lat: center.lat, lng: center.lng } : null),
    [moved, extras.data?.location, center],
  );
  const zoneName = (zone: string) => map.data?.zones.find((z) => z.id === zone)?.name;
  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!point) return;
      setMoved({
        lat: point.lat + (dy * STEP) / 111000,
        lng: point.lng + (dx * STEP) / 88000,
      });
    },
    [point],
  );
  if (!extras.loading && !extras.data)
    return (
      <>
        <AppHeader title={t('merchantStorePin')} back="/merchant" />
        <div className={s.main}>
          <p className={s.lead}>{t('merchantPinLive')}</p>
        </div>
      </>
    );
  const mine = map.data?.stores.find((x) => x.store_id === store.data?.store_id);
  const pins: MapPin[] = [
    ...(map.data?.stores ?? [])
      .filter((x) => x.store_id !== store.data?.store_id && x.lat && x.lng)
      .map((x) => ({
        id: x.store_id,
        name: x.name,
        lat: x.lat!,
        lng: x.lng!,
        category: storeCategory(x, zoneName(x.zone_id)),
        state: 'dim' as const,
      })),
    ...(point && mine
      ? [
          {
            id: mine.store_id,
            name: mine.name,
            ...point,
            category: storeCategory(mine, zoneName(mine.zone_id)),
            state: 'selected' as const,
          },
        ]
      : []),
  ];
  return (
    <div className={s.pinPage}>
      <Resource state={map}>
        <MapView
          className={s.pinMap}
          label={fill(t('merchantPinMap'), { market })}
          boundary={map.data?.boundary}
          boundaryLabel={market}
          facilities={map.data?.facilities}
          pins={pins}
          sample={isMock}
          topInset={100}
          bottomInset={300}
        />
      </Resource>
      <button
        type="button"
        className={s.pinBack}
        aria-label="뒤로"
        onClick={() => navigate('/merchant')}
      >
        <Icon name="back" />
      </button>
      <div className={s.pinLabel}>
        <span>{t('merchantStorePin')}</span>
      </div>
      <div className={s.pinSheet}>
        <span className={s.handle} aria-hidden="true" />
        <div className={s.heading}>
          <h1 className={`${s.title} ${s.title26}`}>{t('merchantPinTitle')}</h1>
          <p className={s.lead}>{point ? t('merchantPinLead') : t('merchantPinNoMap')}</p>
        </div>
        {point && (
          <div className={s.nudge} role="group" aria-label={t('merchantPinMove')}>
            {moves.map((m) => (
              <Button
                key={m.key}
                size="md"
                variant="surface"
                aria-label={`${t('merchantPinMove')}: ${t(m.key)}`}
                onClick={() => nudge(m.d[0], m.d[1])}
              >
                <span style={{ display: 'flex', transform: `rotate(${m.rotate}deg)` }}>
                  <Icon name={m.icon} />
                </span>
              </Button>
            ))}
          </div>
        )}
        {save.error && <ErrorBox message={save.error} />}
        <Button
          variant="primary"
          wide
          disabled={!point}
          loading={save.loading}
          onClick={() =>
            point &&
            void save.run(point).then((r) => {
              if (r) navigate('/merchant', { state: { notice: t('merchantPinSaved') } });
            })
          }
        >
          {t('merchantPinConfirm')}
        </Button>
      </div>
    </div>
  );
}
