import { isMock, request, query } from './client';
import * as mock from './mock';
import type { MarketMap } from '../types/contract';
export const getMarketMap = (id: string, item_id?: string, unit?: string) =>
  isMock
    ? mock.map(id, item_id, unit)
    : request<MarketMap>(`/markets/${encodeURIComponent(id)}/map?${query({ item_id, unit })}`);
