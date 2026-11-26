import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../types/contract';

// 손님 위치. undefined=아직 모름, null=거부했거나 쓸 수 없음. ask=false면 묻지 않음(첫 방문 안내 전).
// 위치는 가까운 시장과 점포를 고르는 데만 쓰고 서버나 지도 앱에 넘기지 않음.
export function usePosition(ask = true) {
  const [position, setPosition] = useState<LatLng | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ask) return;
    let active = true;
    if (!navigator.geolocation) {
      setPosition(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (active) setPosition({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        if (active) setPosition(null);
      },
      { timeout: 5000 },
    );
    return () => {
      active = false;
    };
  }, [ask, attempt]);
  const locate = useCallback(() => setAttempt((n) => n + 1), []);
  return { position, locate };
}
