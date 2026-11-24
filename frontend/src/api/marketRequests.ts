import { isMock, request, query } from './client';
import type { Market, MarketDemand, MarketApplication, JoinRequest } from '../types/contract';
import * as mock from './mock/marketRequests';
export const searchMarkets = (q: string) =>
  isMock ? mock.search(q) : request<Market[]>(`/markets/search?${query({ q })}`);
export const getDemand = (id: string) =>
  isMock ? mock.demand(id) : request<MarketDemand>(`/markets/${encodeURIComponent(id)}/demand`);
export const requestMarket = (id: string) =>
  isMock
    ? mock.requestMarket(id)
    : request<{ requested: boolean; requests_7d: number | null }>(
        `/markets/${encodeURIComponent(id)}/requests`,
        { method: 'POST' },
      );
export const join = (data: JoinRequest) =>
  isMock
    ? mock.join(data)
    : request<MarketApplication>('/join', { method: 'POST', body: JSON.stringify(data) });
export const applications = () =>
  isMock ? mock.applications() : request<MarketApplication[]>('/admin/applications?status=pending');
export const decide = (id: number, action: 'approve' | 'reject') =>
  isMock
    ? mock.decide(id, action)
    : request<MarketApplication>(`/admin/applications/${id}/${action}`, { method: 'POST' });
