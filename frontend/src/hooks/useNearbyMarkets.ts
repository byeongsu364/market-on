import { useCallback } from 'react';
import { getMarkets } from '../api/markets';
import { useResource } from './useResource';
import { usePosition } from './usePosition';

/** 주변 시장. ask=false(첫 방문 안내 전)면 위치 없이 목록만 받음 */
export function useNearbyMarkets(ask = true) {
  const { position, locate } = usePosition(ask);
  const query = ask ? position : null;
  const markets = useResource(
    useCallback(async () => {
      if (query === undefined) return null;
      return getMarkets(query?.lat, query?.lng);
    }, [query]),
  );
  return { position: ask ? position : undefined, markets, locate };
}
