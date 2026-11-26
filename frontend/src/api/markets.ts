import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Market, MarketItem, PublicConfig } from '../types/contract';
export const getMarkets = (lat?: number, lng?: number, radius_km = 10) =>
  isMock
    ? mock.nearby(lat, lng, radius_km)
    : request<Market[]>(`/markets/nearby?${query({ lat, lng, radius_km })}`);

export const getMarketItems = (id: string) =>
  isMock ? mock.marketItems(id) : request<MarketItem[]>(`/markets/${encodeURIComponent(id)}/items`);
// mock이어도 VITE_PUBLIC_CONFIG=live 이면 지도 키만 실제 서버에 물어봄(mock 핀을 네이버 지도 위에서 보기)
export const getPublicConfig = () =>
  isMock && import.meta.env.VITE_PUBLIC_CONFIG !== 'live'
    ? mock.publicConfig()
    : request<PublicConfig>('/config/public');

export const getMarket = (id: string): Promise<Market> =>
  isMock
    ? mock.nearby().then((list) => {
        const market = list.find((m) => m.market_id === id);
        if (!market) throw new Error('시장을 찾을 수 없어요.');
        return market;
      })
    : request<Market>(`/markets/${encodeURIComponent(id)}`);
