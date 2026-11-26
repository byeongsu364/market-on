import { isMock, request } from './client';
import * as mock from './mock/merchant';
import * as mock030 from './mock/merchant030';
import type { LatLng, MerchantExtras } from '../types/contract';
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

// 030: 백엔드에 아직 없는 기능(단골 수, 오늘 품절, 가게 위치 저장)은 mock에서만. live는 null이라 화면이 숨김.
const notAvailable = () =>
  Promise.reject({ code: 'NOT_AVAILABLE', message: '아직 준비 중인 기능이에요.' });
export const getExtras = (): Promise<MerchantExtras | null> =>
  isMock ? mock030.extras() : Promise.resolve(null);
export const setSoldOut = (item_id: string, out: boolean): Promise<MerchantExtras> =>
  isMock ? mock030.setSoldOut(item_id, out) : notAvailable();
export const saveLocation = (point: LatLng): Promise<MerchantExtras> =>
  isMock ? mock030.saveLocation(point) : notAvailable();
