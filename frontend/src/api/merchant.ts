import { isMock, request } from './client';
import * as mock from './mock/merchant';
import type { MerchantStore, ClosingSale, SaleRequest, PosterInfo } from '../types/contract';
export const getStore = () =>
  isMock ? mock.getStore() : request<MerchantStore>('/merchant/store');
export const updateStore = (q: Partial<Pick<MerchantStore, 'hours' | 'item_ids'>>) =>
  isMock
    ? mock.updateStore(q)
    : request<MerchantStore>('/merchant/store', { method: 'PATCH', body: JSON.stringify(q) });
export const getSales = (status: 'active' | 'ended') =>
  isMock ? mock.getSales(status) : request<ClosingSale[]>(`/merchant/sales?status=${status}`);
export const createSale = (q: SaleRequest) =>
  isMock
    ? mock.createSale(q)
    : request<ClosingSale>('/merchant/sales', { method: 'POST', body: JSON.stringify(q) });
export const endSale = (id: number) =>
  isMock ? mock.endSale(id) : request<ClosingSale>(`/merchant/sales/${id}/end`, { method: 'POST' });
export const repostSale = (id: number, ends_at: string) =>
  isMock
    ? mock.repostSale(id, ends_at)
    : request<ClosingSale>(`/merchant/sales/${id}/repost`, {
        method: 'POST',
        body: JSON.stringify({ ends_at }),
      });
export const getPoster = () => (isMock ? mock.poster() : request<PosterInfo>('/merchant/poster'));

export const getPrices = () =>
  isMock
    ? mock.getPrices()
    : request<import('../types/contract').MerchantPriceRow[]>('/merchant/prices');
export const confirmPrice = (q: import('../types/contract').PriceConfirmRequest) =>
  isMock
    ? mock.confirmPrice(q)
    : request<{ price: number; confirmed_at: string }>('/merchant/prices/confirm', {
        method: 'POST',
        body: JSON.stringify(q),
      });
