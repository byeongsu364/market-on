import { describe, it, expect } from 'vitest';
import { formatPrice } from '../utils/formatPrice';
import { diffPct } from '../utils/diffPct';
import { convertUnit } from '../utils/convertUnit';
import { formatDate } from '../utils/formatDate';
describe('가격 계산', () => {
  it('천 단위 가격과 날짜를 표시한다', () => {
    expect(formatPrice(2576)).toBe('2,576원');
    expect(formatDate('2026-11-20T10:00')).toBe('2026-11-20');
  });
  it('가격 차이의 부호를 보존한다', () => {
    expect(diffPct(3500, 3980)).toBe(-12);
    expect(diffPct(3500, 2576)).toBe(36);
    expect(diffPct(100, 100)).toBe(0);
  });
  it('1단은 0.8kg이며 역환산할 수 있다', () => {
    expect(convertUnit(2576, 'kg', 'unit:bunch')).toBeCloseTo(2060.8);
    expect(convertUnit(2060.8, 'unit:bunch', 'kg')).toBeCloseTo(2576);
  });
});
