import { isMock, request } from './client';
import * as mock from './mock/merchant030';
import type { MarketSummary, MarketMerchant, User } from '../types/contract';
export const getMarket = () =>
  isMock ? mock.marketSummary() : request<MarketSummary>('/market-admin/market');
export const getMerchants = (status: User['status']) =>
  isMock
    ? mock.marketMerchants(status)
    : request<MarketMerchant[]>(`/market-admin/merchants?status=${status}`);
export const decide = (id: string, action: 'approve' | 'reject' | 'disable') =>
  isMock
    ? mock.marketDecide(id, action)
    : request<{ user: User }>(`/market-admin/merchants/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
export const getMarketPoster = () =>
  isMock
    ? mock.marketPoster()
    : request<{ market_name: string; url: string }>('/market-admin/poster');
/** 공지와 휴무일(030 5장: 백엔드 없음, 편집은 mock만). live는 null */
export const getNotice = (): Promise<string | null> =>
  isMock ? mock.notice() : Promise.resolve(null);
export const saveNotice = (text: string) =>
  isMock
    ? mock.saveNotice(text)
    : Promise.reject({ code: 'NOT_AVAILABLE', message: '아직 준비 중인 기능이에요.' });
