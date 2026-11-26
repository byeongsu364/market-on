import { isMock, request } from './client';
import * as mock from './mock';
import type { RecommendRequest, RecommendResponse } from '../types/contract';
export const recommend = (q: RecommendRequest) =>
  isMock
    ? mock.recommend(q)
    : request<RecommendResponse>('/recommend', { method: 'POST', body: JSON.stringify(q) }).catch(
        (error: { status?: number; message?: string }) => {
          if (error.status === 503)
            throw new Error('지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요');
          if (error.status === 429) throw new Error('질문이 많아요. 잠시 뒤에 다시 물어봐 주세요');
          throw error;
        },
      );
