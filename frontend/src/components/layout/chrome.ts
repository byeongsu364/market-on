// 화면별 틀. 1024px 미만은 한 단 + 하단 탭(지도·시장 목록·장보기에서만),
// 1024px 이상은 상단 머리말 + 넓은 본문(지도 화면은 꽉 채움).
export function chromeFor(pathname: string) {
  const map = pathname === '/';
  const tabbar = map || pathname === '/markets' || pathname === '/shop';
  const bleed = map || pathname === '/shop/route';
  return { tabbar, bleed };
}
