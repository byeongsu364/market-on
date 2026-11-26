/**
 * 처음 들어온 손님에게 언어 선택 → 단계별 안내(pages/welcome)를 한 번 보임(2026-11-27).
 * 상인·시장 관리자·운영자·로그인·가입 화면은 건너뜀(그 사람들은 손님 안내가 필요 없음).
 */
export const WELCOMED_KEY = 'welcomed';
const SKIP = ['/login', '/signup', '/join', '/merchant', '/market-admin', '/admin'];

export function readWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === '1';
  } catch {
    return true; // 저장소를 못 쓰면 매번 막지 않음
  }
}
export function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    /* 이번 방문만 */
  }
}
export function needsWelcome(pathname: string, welcomed: boolean): boolean {
  if (welcomed) return false;
  return !SKIP.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
