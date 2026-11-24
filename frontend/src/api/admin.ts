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
