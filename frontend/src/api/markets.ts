import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Market, MarketItem, PublicConfig } from '../types/contract';
export const getMarkets = (lat?: number, lng?: number, radius_km = 10) =>
  isMock
    ? mock.nearby(lat, lng, radius_km)
    : request<Market[]>(`/markets/nearby?${query({ lat, lng, radius_km })}`);

export const getMarketItems = (id: string) =>
  isMock ? mock.marketItems(id) : request<MarketItem[]>(`/markets/${encodeURIComponent(id)}/items`);
export const getPublicConfig = () =>
  isMock ? mock.publicConfig() : request<PublicConfig>('/config/public');
