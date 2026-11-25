import { isMock, request } from './client';
import * as mock from './mock';
import type { RecommendRequest, RecommendResponse } from '../types/contract';
export const recommend = (q: RecommendRequest) =>
  isMock
    ? mock.recommend(q)
    : request<RecommendResponse>('/recommend', { method: 'POST', body: JSON.stringify(q) }).catch(
        (error) => {
          if (error.status === 404 || error.status === 503)
            throw new Error('추천 기능을 준비하고 있어요. 품목을 직접 찾아 주세요');
          throw error;
        },
      );
