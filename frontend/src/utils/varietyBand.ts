import type { Price } from '../types/contract';
import { unitLabel } from './convertUnit';
import { diffPct } from './diffPct';
import { bandOf } from './priceBand';

/** "1단" → "단", "1개" → "개" (수량 뒤에 붙임) */
export const unitShort = (u: string) => unitLabel(u).replace(/^1/, '');

/** 한 품종의 기준시세와 견준 칸(품종 비교 목록, 품종 견줘 보기). 기준시세가 없거나 대체값이면 null */
export const varietyBand = (seen: number | undefined, reference: number | null, price?: Price) =>
  seen && reference != null && !price?.fallback ? bandOf(diffPct(seen, reference)) : null;
