import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Market } from '../types/contract';
export const getMarkets = (lat?: number, lng?: number) =>
  isMock ? mock.nearby(lat, lng) : request<Market[]>(`/markets/nearby?${query({ lat, lng })}`);
