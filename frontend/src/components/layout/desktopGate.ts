/**
 * PC(1024px 이상)에서 손님 화면 대신 소개 페이지(pages/landing)를 보일지 정함(2026-11-27).
 * 손님 화면은 시장에서 휴대폰으로 쓰는 앱이라 PC에서는 소개와 휴대폰으로 여는 QR을 보이고,
 * 상인·시장 관리자·운영자 화면(로그인·가입 포함)은 PC에서 그대로 씀.
 * 소개 페이지의 "PC에서 그대로 써 보기"를 누르면 이 탭(sessionStorage)에서는 앱을 보임.
 */
export const PC_APP_KEY = 'pc-app';
const PC_ROUTES = ['/login', '/signup', '/join', '/merchant', '/market-admin', '/admin'];

export function showLanding(pathname: string, desktop: boolean): boolean {
  if (!desktop) return false;
  if (PC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  try {
    if (sessionStorage.getItem(PC_APP_KEY)) return false;
  } catch {
    /* 저장소를 못 쓰면 소개 페이지 */
  }
  return true;
}
