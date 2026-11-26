/**
 * 소개 사이트(PC 발표용, 2026-11-27)의 숫자와 주소를 한곳에.
 * 숫자는 팀이 확인한 값(개발 DB·자동 테스트 기준)이에요. 바뀌면 여기만 고쳐요.
 */

/** [웹으로 시작하기]가 여는 앱 화면: 경동시장 안 지도 */
export const APP_START = '/?market=market%3Agyeongdong';
/** QR과 주소 복사에 쓰는 배포 주소 */
export const SITE_URL = 'https://marketon.laea.io/';
export const SITE_HOST = 'marketon.laea.io';
export const SITE_START_URL = `https://marketon.laea.io${APP_START}`;

export const FACTS = {
  /** aT 소매가격 조사 6부류 전체 */
  items: 95,
  varieties: 144,
  checkpoints: 40,
  documents: 79,
  sources: 26,
  /** 소상공인 상가정보 경동시장 식품 점포 */
  stores: 106,
  appleStores: 52,
  tests: 949,
} as const;

/** 경동시장 식품 점포 106곳의 업종 나눔 */
export const STORE_SPLIT = [
  ['채소·과일', 52],
  ['건어물·젓갈', 23],
  ['수산', 14],
  ['반찬', 11],
  ['정육', 5],
  ['떡', 1],
] as const;
