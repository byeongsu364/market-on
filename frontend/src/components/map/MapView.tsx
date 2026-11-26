import { useEffect, useState, type ReactNode } from 'react';
import { getPublicConfig } from '../../api/markets';
import { isMock } from '../../api/client';
import { loadNaverMap, onNaverAuthFailure, type NaverMaps } from '../../utils/naverMap';
import type { Facility, LatLng } from '../../types/contract';
import type { MapMarker, MapMarketLabel, MapPin, MapStop } from './markers';
import SketchMap from './SketchMap';
import NaverMap from './NaverMap';
import './map.css';

export type { MapPin, MapStop, MapMarketLabel, MapMarker };
export type MapFailure = 'no-key' | 'load' | 'auth';
export type MapViewProps = {
  /** 지도 이름(화면 읽기 프로그램) */
  label: string;
  boundary?: LatLng[];
  boundaryLabel?: string;
  facilities?: Facility[];
  pins?: MapPin[];
  markets?: MapMarketLabel[];
  stops?: MapStop[];
  me?: LatLng | null;
  /** 경로 순서 선(장보기 동선) */
  route?: LatLng[];
  /** 표시물을 누르면 그 id */
  onSelect?: (id: string, type: MapMarker['type']) => void;
  /** 지도가 비었을 때 가운데 */
  center?: LatLng;
  /** 예시 좌표일 때 "핀 위치는 예시" */
  sample?: boolean;
  /** 지도 위에 띄울 요소(검색창, 버튼 등) */
  children?: ReactNode;
  /** 아래쪽에 시트가 덮는 높이(px): 내용이 그 위에 오도록 맞춤 */
  bottomInset?: number;
  topInset?: number;
  /** 'sketch'로 강제(테스트) */
  mode?: 'auto' | 'sketch';
  onFailure?: (reason: MapFailure) => void;
  className?: string;
};

/**
 * 지도 하나로 감싼 두 방식(지시서 030 6장).
 * - 네이버 지도: /config/public 으로 키를 받고 SDK가 뜨면 씀.
 * - 약도: mock에서 키가 없을 때와 테스트에서 씀.
 * live에서 키가 없거나 SDK를 못 불러오거나 인증이 실패하면 onFailure → 화면이 Error를 보여 줌.
 */
export default function MapView(props: MapViewProps) {
  const [maps, setMaps] = useState<NaverMaps | null>(null);
  const [failed, setFailed] = useState<MapFailure | null>(null);
  const { mode = 'auto', onFailure } = props;
  useEffect(() => {
    if (mode === 'sketch') return;
    let active = true;
    const fail = (reason: MapFailure) => {
      if (!active) return;
      setFailed(reason);
      setMaps(null);
      if (!isMock) onFailure?.(reason);
    };
    getPublicConfig()
      .then((config) => {
        if (!config.naver_map_client_id) return fail('no-key');
        return loadNaverMap(config.naver_map_client_id).then((m) => active && setMaps(m));
      })
      .catch(() => fail('load'));
    const stop = onNaverAuthFailure(() => fail('auth'));
    return () => {
      active = false;
      stop();
    };
  }, [mode, onFailure]);
  const naver = mode !== 'sketch' && maps && !failed;
  return naver ? <NaverMap {...props} maps={maps} /> : <SketchMap {...props} />;
}
