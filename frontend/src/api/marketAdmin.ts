import { request } from './client';
import type { MarketSummary, MarketMerchant, User } from '../types/contract';
export const getMarket = () => request<MarketSummary>('/market-admin/market');
export const getMerchants = (status: User['status']) =>
  request<MarketMerchant[]>(`/market-admin/merchants?status=${status}`);
export const decide = (id: string, action: 'approve' | 'reject' | 'disable') =>
  request<{ user: User }>(`/market-admin/merchants/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  });
export const getMarketPoster = () =>
  request<{ market_name: string; url: string }>('/market-admin/poster');
