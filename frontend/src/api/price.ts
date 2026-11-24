import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Price, PriceRequest } from '../types/contract';
export const getPrice = (q: PriceRequest) =>
  isMock ? mock.price(q) : request<Price>(`/price?${query(q)}`);
