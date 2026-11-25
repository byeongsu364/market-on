import { useCallback } from 'react';
import { getPrice } from '../api/price';
import { useResource } from './useResource';
import type { PriceRequest } from '../types/contract';
export const usePrice = ({ item_id, market_id, unit, seen_price }: PriceRequest) =>
  useResource(
    useCallback(async () => {
      try {
        return await getPrice({ item_id, market_id, unit, seen_price });
      } catch (error) {
        if ((error as { status?: number }).status === 404)
          throw new Error('기준시세가 아직 없어요');
        throw error;
      }
    }, [item_id, market_id, unit, seen_price]),
  );
