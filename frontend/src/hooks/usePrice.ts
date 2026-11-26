import { useCallback } from 'react';
import { getPrice } from '../api/price';
import { useResource } from './useResource';
import type { PriceRequest } from '../types/contract';
export const usePrice = ({ item_id, market_id, unit, seen_price, variety_id }: PriceRequest) =>
  useResource(
    useCallback(async () => {
      if (!item_id || !market_id || !unit) return null;
      try {
        return await getPrice({ item_id, market_id, unit, seen_price, variety_id });
      } catch (error) {
        if ((error as { status?: number }).status === 404)
          throw new Error('기준시세가 아직 없어요');
        throw error;
      }
    }, [item_id, market_id, unit, seen_price, variety_id]),
  );
