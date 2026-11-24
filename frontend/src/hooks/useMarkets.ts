import { useCallback } from 'react';
import { getMarkets } from '../api/markets';
import { useResource } from './useResource';
export const useMarkets = (lat?: number, lng?: number) =>
  useResource(useCallback(() => getMarkets(lat, lng), [lat, lng]));
