import { useCallback } from 'react';
import { getPrice } from '../api/price';
import { useResource } from './useResource';
import type { PriceRequest } from '../types/contract';
export const usePrice = ({ item_id, market_id, unit, seen_price }: PriceRequest) =>
  useResource(
    useCallback(
      () => getPrice({ item_id, market_id, unit, seen_price }),
      [item_id, market_id, unit, seen_price],
    ),
  );
