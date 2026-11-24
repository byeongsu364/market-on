import { useCallback } from 'react';
import { getMarketMap } from '../api/stores';
import { useResource } from './useResource';
export const useMarketMap = (id: string, item?: string) =>
  useResource(
    useCallback(async () => {
      const map = await getMarketMap(id, item);
      return {
        ...map,
        stores: [...map.stores].sort((a, b) => Number(!!b.active_sale) - Number(!!a.active_sale)),
      };
    }, [id, item]),
  );
