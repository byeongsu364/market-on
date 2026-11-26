import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Price, PriceHistory, PriceRequest } from '../types/contract';
export const getPrice = (q: PriceRequest) =>
  isMock ? mock.price(q) : request<Price>(`/price?${query(q)}`);

/** 최근 4주 시세. 데이터 없는 주는 null이며 화면에서 빈 값을 유지한다. */
export const getPriceHistory = (
  item_id: string,
  variety_id: string | undefined,
  unit: string,
  market_id?: string,
): Promise<PriceHistory | null> =>
  isMock
    ? mock.priceHistory(item_id, variety_id, unit)
    : request<PriceHistory>(
        `/prices/history?${query({ item_id, variety_id, unit, market_id, weeks: 4 })}`,
      );
