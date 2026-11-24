import { isMock, request } from './client';
import type { PriceReportRequest, PriceReportResponse } from '../types/contract';
export const postPriceReport = (q: PriceReportRequest) =>
  isMock
    ? Promise.resolve({ id: 1, updated: !!q.store_id })
    : request<PriceReportResponse>('/price-reports', { method: 'POST', body: JSON.stringify(q) });
