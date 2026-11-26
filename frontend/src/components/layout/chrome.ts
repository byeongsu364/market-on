// 화면별 틀. 1024px 미만은 한 단 + 하단 탭(지도·시장 목록·장보기에서만),
// 1024px 이상은 상단 머리말 + 넓은 본문(지도 화면은 꽉 채움).
export function chromeFor(pathname: string) {
  const map = pathname === '/';
  const tabbar = map || pathname === '/markets' || pathname === '/shop';
  // 점포 상세(/s/:id)도 PC에서는 왼쪽 패널과 오른쪽 지도로 꽉 채움
  const bleed = map || pathname === '/shop/route' || pathname.startsWith('/s/');
  // 로그인·회원가입 PC 시안은 머리말 없이 왼쪽 검정 면 + 오른쪽 폼
  const webHeader = !['/login', '/signup'].includes(pathname);
  return { tabbar, bleed, webHeader };
}
