import { useCallback } from 'react';
import { getMarketMap } from '../api/stores';
import { useResource } from './useResource';
export const useMarketMap = (id: string, item?: string, unit?: string) =>
  useResource(
    useCallback(async () => {
      if (!id) return null;
      const map = await getMarketMap(id, item, unit);
      return {
        ...map,
        stores: [...map.stores].sort(
          (a, b) =>
            (item
              ? (a.price ? Number(a.price.stale) : 2) - (b.price ? Number(b.price.stale) : 2)
              : 0) || Number(!!b.active_sale) - Number(!!a.active_sale),
        ),
      };
    }, [id, item, unit]),
  );
