import { useCallback } from 'react';
import { getMarkets, getMarket } from '../api/markets';
import { useResource } from './useResource';
export const useMarkets = (lat?: number, lng?: number) =>
  useResource(useCallback(() => getMarkets(lat, lng), [lat, lng]));

export const useMarket = (id: string) =>
  useResource(useCallback(() => (id ? getMarket(id) : Promise.resolve(null)), [id]));
