import { isMock, request } from './client';
import * as mock from './mock';
import type { RecommendRequest, RecommendResponse } from '../types/contract';
export const recommend = (q: RecommendRequest) =>
  isMock
    ? mock.recommend(q)
    : request<RecommendResponse>('/recommend', { method: 'POST', body: JSON.stringify(q) });
