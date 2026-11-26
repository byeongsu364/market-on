import { pipelineReport } from './mock/pipeline';
import * as marketMock from './mock/marketRequests';
import { isMock, request } from './client';
import * as mock from './mock/merchant';
import type { PendingMerchant } from '../types/contract';
export const getPending = () =>
  isMock ? mock.pending() : request<PendingMerchant[]>('/admin/merchants?status=pending');
export const decide = (id: string, action: 'approve' | 'reject' | 'disable') =>
  isMock
    ? mock.decide(
        id,
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'disabled',
      )
    : request<void>(`/admin/merchants/${encodeURIComponent(id)}/${action}`, { method: 'POST' });

export const getListedMarkets = () =>
  isMock
    ? marketMock.listedMarkets()
    : request<import('../types/contract').ListedMarketStats[]>('/admin/markets?status=listed');
export const getActiveMarkets = () =>
  isMock
    ? marketMock.activeMarkets()
    : request<import('../types/contract').ActiveMarketStats[]>('/admin/markets?status=active');

export interface PipelineReport {
  load: {
    started_at: string;
    seconds: number;
    results: Record<string, Record<string, unknown>>;
    checks: { name: string; ok: boolean; detail: string }[];
  } | null;
  eval: {
    started_at: string;
    metrics: Record<
      string,
      {
        passed?: number;
        total?: number;
        rate?: number | null;
        median?: number | null;
        max?: number | null;
      }
    >;
  } | null;
}
export const getPipelineReport = () =>
  isMock ? pipelineReport() : request<PipelineReport>('/admin/pipeline/report');
