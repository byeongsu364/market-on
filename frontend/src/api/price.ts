import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Price, PriceHistory, PriceRequest } from '../types/contract';
export const getPrice = (q: PriceRequest) =>
  isMock ? mock.price(q) : request<Price>(`/price?${query(q)}`);

/** 최근 4주 시세(030). 백엔드에 아직 없어서 live에서는 null(화면에서 숨김) */
export const getPriceHistory = (
  item_id: string,
  variety_id: string | undefined,
  unit: string,
): Promise<PriceHistory | null> =>
  isMock ? mock.priceHistory(item_id, variety_id, unit) : Promise.resolve(null);
