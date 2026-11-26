import { isMock, request } from './client';
import * as mock from './mock/reviews';
import type { StoreReviews, ReviewWrite } from '../types/contract';
const path = (id: string) => `/stores/${encodeURIComponent(id)}/reviews`;
export const getReviews = (id: string, limit = 20, offset = 0) =>
  isMock
    ? mock.list(id, limit, offset)
    : request<StoreReviews>(`${path(id)}?limit=${limit}&offset=${offset}`);
export const saveReview = (id: string, data: ReviewWrite) =>
  isMock
    ? mock.save(id, data)
    : request<StoreReviews>(`${path(id)}/me`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteReview = (id: string) =>
  isMock ? mock.remove(id) : request<void>(`${path(id)}/me`, { method: 'DELETE' });
