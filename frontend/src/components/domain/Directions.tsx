import { useCallback, useEffect, useRef } from 'react';
import type { Market } from '../../types/contract';
import Sheet from '../common/Sheet';
import { directionUrls } from '../../utils/directions';
export default function Directions({ market, onClose }: { market: Market; onClose: () => void }) {
  const urls = directionUrls(market, window.location.origin);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
  }, []);
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
  return (
    <Sheet title="길 안내" onClose={onClose}>
      <p>{market.name}으로 이동해요</p>
      <a
        className="secondary wide"
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
        네이버지도
      </a>
      <a className="secondary wide" href={urls.kakao} onClick={cancel}>
        카카오맵
      </a>
    </Sheet>
  );
}
