import { useCallback, useEffect, useRef } from 'react';
import Sheet from '../common/Sheet';
import Icon from '../common/Icon';
import { buttonClass } from '../common/buttonClass';
import { directionUrls, distanceM, walkMinutes, type Destination } from '../../utils/directions';
import { fill } from '../../utils/josa';
import s from './RouteSheet.module.css';
import { useT } from '../../i18n';
import type { LatLng } from '../../types/contract';

/**
 * 길 안내 시트(시안 Route). 목적지(시장이나 점포)만 지도 앱에 넘기고 손님 위치는 넘기지 않음.
 * me는 화면에 "걸어서 N분"을 적는 데만 씀.
 */
export default function RouteSheet({
  destination,
  kind,
  me,
  approximate,
  onClose,
}: {
  destination: Destination & { label?: string };
  kind: 'store' | 'market';
  me?: LatLng | null;
  /** 점포 좌표가 없어 시장 위치로 대신할 때 */
  approximate?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const urls = directionUrls(destination, window.location.origin);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', cancel);
    return () => {
      cancel();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', cancel);
    };
  }, [cancel]);
  const label = destination.label ?? destination.name;
  const meters = me && !approximate ? distanceM(me, destination) : null;
  // 시장 밖 먼 곳이면 걸어서 몇 분은 적지 않음
  const near = meters !== null && meters <= 3000;
  return (
    <Sheet title={fill(t('mapRouteTitle'), { name: label })} onClose={onClose}>
      <p className={s.text}>
        {kind === 'store' && !approximate ? t('mapRouteStoreText') : t('mapRouteMarketText')}
        {approximate && ` ${t('mapRouteApprox')}`}
        {near &&
          ` ${fill(t('mapRouteWalk'), { minutes: walkMinutes(meters!), meters: Math.round(meters! / 10) * 10 })}`}
      </p>
      <a
        className={buttonClass({ variant: 'primary', size: 'lg', wide: true })}
        href={urls.naverWeb}
        onClick={(e) => {
          if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) return;
          e.preventDefault();
          cancel();
          timer.current = setTimeout(() => {
            if (!document.hidden) window.location.assign(urls.naverWeb);
          }, 1500);
          window.location.assign(urls.naverApp);
        }}
      >
        <Icon name="navigate" size={20} />
        {t('mapRouteNaver')}
      </a>
      <a
        className={buttonClass({ variant: 'surface', size: 'lg', wide: true })}
        href={urls.kakao}
        onClick={cancel}
      >
        {t('mapRouteKakao')}
      </a>
      <p className={s.note}>{t('mapRoutePrivacy')}</p>
    </Sheet>
  );
}
