import * as merchantMock from './mock/merchant';
import { isMock, request, query } from './client';
import * as mock from './mock';
import type { MarketMap, MultiItemMap } from '../types/contract';
export const getMarketMap = (
  id: string,
  item_id?: string,
  unit?: string,
  lat?: number,
  lng?: number,
) =>
  isMock
    ? mock.map(id, item_id, unit)
    : request<MarketMap>(
        `/markets/${encodeURIComponent(id)}/map?${query({ item_id, unit, lat, lng })}`,
      );

/** 여러 품목 지도(030). 백엔드에 여러 품목 응답이 생기기 전까지 live는 품목별 지도를 합쳐 만듦 */
export const getMultiItemMap = async (id: string, item_ids: string[]): Promise<MultiItemMap> => {
  if (isMock) return mock.multiMap(id, item_ids);
  const maps = await Promise.all(item_ids.map((item) => getMarketMap(id, item)));
  const base = maps[0] ?? (await getMarketMap(id));
  return {
    ...base,
    item_ids,
    stores: base.stores.map((s) => ({
      ...s,
      highlight: maps.some((m) => m.stores.some((o) => o.store_id === s.store_id && o.highlight)),
    })),
  };
};

export const recordDirections = (id: string) =>
  isMock
    ? merchantMock.direction(id)
    : request<void>(`/stores/${encodeURIComponent(id)}/directions`, {
        method: 'POST',
        keepalive: true,
      });
