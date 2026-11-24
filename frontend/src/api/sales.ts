import { isMock, request, query } from './client';
import * as mock from './mock/merchant';
import type { ActiveSale, StorePage } from '../types/contract';
export const getActiveSales = (market_id?: string, item_id?: string) =>
  isMock
    ? Promise.resolve(mock.activeSales(market_id, item_id))
    : request<ActiveSale[]>(`/sales/active?${query({ market_id, item_id })}`);
export const getPublicStore = (id: string) =>
  isMock ? mock.publicStore(id) : request<StorePage>(`/stores/${encodeURIComponent(id)}`);
export const viewSale = (id: number) =>
  isMock ? mock.view(id) : request<void>(`/sales/${id}/view`, { method: 'POST' });
