import { isMock, request, query } from './client';
import * as mock from './mock';
import type { Item, Language } from '../types/contract';
export const getItem = (id: string, lang: Language) =>
  isMock
    ? mock.getItem(id)
    : request<Item>(`/items/${encodeURIComponent(id)}?${query({ lang })}`, {}, lang);
export const searchItems = (q: string) =>
  isMock ? mock.search(q) : request<Item[]>(`/items/search?${query({ q })}`);

export const getInSeason = (month?: number) =>
  isMock
    ? mock.getInSeason(month)
    : request<import('../types/contract').InSeasonItem[]>(`/items/in-season?${query({ month })}`);
