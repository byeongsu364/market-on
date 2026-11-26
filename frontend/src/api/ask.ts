import { isMock, request } from './client';
import { ask as mockAsk } from './mock';
import type { AskRequest, AskResponse } from '../types/contract';

export const ask = (data: AskRequest): Promise<AskResponse> =>
  isMock
    ? mockAsk(data)
    : request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify(data) });
