import type { Price, PriceBand } from '../types/contract';

// 가격 구간(지시서 030 6장, 기획서 "살까 말까"). 문구는 AI가 아니라 이 코드가 고름.
// 구간은 화면에 보이는 diff_pct(반올림한 정수, utils/diffPct.ts)로 정함.
// 2026-11-27 요청: 판정처럼 읽히는 문구("살 만한 가격이에요", "높은 편이에요") 대신 비교 수치만.
export const BAND_LABELS = ['많이 낮음', '낮음', '조금 높음', '높음'] as const;
/** 기준시세와의 차이(%)만 말하는 문장 */
export const diffMessage = (diff: number) =>
  diff === 0
    ? '기준시세와 같아요'
    : `기준시세보다 ${Math.abs(diff)}% ${diff < 0 ? '낮아요' : '높아요'}`;
export const NO_BAND_MESSAGE = '비교는 참고만 하세요';
export const FALLBACK_LABELS: Record<NonNullable<Price['fallback']>, string> = {
  region_avg: '같은 지역 평균',
  national_avg: '전국 평균',
  last_valid: '최근 조사값',
};

/** diff_pct(%)를 네 칸 중 하나로. null이면 비교하지 않음 */
export function bandOf(diff: number | null | undefined): PriceBand | null {
  if (diff == null || !Number.isFinite(diff)) return null;
  if (diff < -30) return 1;
  if (diff <= 5) return 2;
  if (diff <= 20) return 3;
  return 4;
}

export type PriceVerdict = {
  band: PriceBand | null;
  message: string;
  /** 대체 기준을 썼을 때 무엇으로 대신했는지 */
  fallbackNote: string | null;
  diff: number | null;
  reference: number | null;
};

/**
 * 결과 화면, 판단 카드, 목록의 작은 눈금이 함께 쓰는 판정.
 * - 기준시세가 없거나 대체값(fallback)이면 칸을 모두 끄고 "비교는 참고만 하세요".
 * - 고른 품종의 reference_price가 비어 있으면 그 품종은 기준시세가 없는 것으로 봄.
 * - 서버가 band를 주면 그 값을 씀.
 */
export function priceBand(
  price: Price | null | undefined,
  varietyId?: string | null,
): PriceVerdict {
  if (!price)
    return {
      band: null,
      message: NO_BAND_MESSAGE,
      fallbackNote: null,
      diff: null,
      reference: null,
    };
  const variety = price.varieties?.find((v) => v.variety_id === (varietyId ?? price.variety_id));
  const reference = variety ? variety.reference_price : price.reference_price;
  const fallbackNote = price.fallback ? `${FALLBACK_LABELS[price.fallback]}으로 대신했어요` : null;
  if (reference == null || price.fallback)
    return { band: null, message: NO_BAND_MESSAGE, fallbackNote, diff: null, reference };
  const diff = price.diff_pct;
  const band = price.band ?? bandOf(diff);
  return {
    band,
    message: band && diff != null ? diffMessage(diff) : NO_BAND_MESSAGE,
    fallbackNote,
    diff: diff ?? null,
    reference,
  };
}
