import { useCallback, useEffect, useState } from 'react';
import { getMarkets } from '../api/markets';
import { useResource } from './useResource';
import type { Market } from '../types/contract';
export type MapMode = 'inside' | 'outside';
export function mapMode(
  item: string | undefined,
  selected: Market | null,
  markets: Market[],
): MapMode {
  if (item) return 'inside';
  const nearest = markets
    .filter((m) => m.status === 'active' && m.distance_m !== null)
    .sort((a, b) => a.distance_m! - b.distance_m!)[0];
  return nearest && nearest.distance_m! <= 1000 && nearest.market_id === selected?.market_id
    ? 'inside'
    : 'outside';
}
export function useNearbyMarkets() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let active = true;
    const denied = () => {
      if (active) setPosition(null);
    };
    if (!navigator.geolocation) denied();
    else
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (active) setPosition({ lat: coords.latitude, lng: coords.longitude });
        },
        denied,
        { timeout: 5000 },
      );
    return () => {
      active = false;
    };
  }, []);
  const markets = useResource(
    useCallback(async () => {
      if (position === undefined) return null;
      return getMarkets(position?.lat, position?.lng);
    }, [position]),
  );
  return { position, markets };
}
