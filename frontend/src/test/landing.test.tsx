import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { PC_APP_KEY, showLanding } from '../components/layout/desktopGate';
import FeatureVideo from '../pages/landing/FeatureVideo';
import { nextStop, stepDistance } from '../pages/landing/motion';
import { SITE_START_URL } from '../pages/landing/facts';

// 소개 사이트(PC 발표용, 2026-11-27 디자인 시안 marketon_site_v1): 홈 · 기능 · 다운로드 · 팀 소개
function asDesktop(on: boolean, reducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches:
        (on && query.includes('min-width')) || (reducedMotion && query.includes('reduced-motion')),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}
function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  );
const where = () => screen.getByTestId('where').textContent;
const pageText = () => document.body.textContent ?? '';
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  asDesktop(false);
});

it('PC의 손님 주소는 소개 페이지, 상인·관리자·로그인 주소는 그대로', () => {
  expect(showLanding('/', true)).toBe(true);
  expect(showLanding('/scan', true)).toBe(true);
  expect(showLanding('/s/store:1', true)).toBe(true);
  for (const p of [
    '/login',
    '/signup',
    '/signup/merchant',
    '/join',
    '/merchant/poster',
    '/market-admin',
    '/admin',
  ])
    expect(showLanding(p, true)).toBe(false);
  expect(showLanding('/', false)).toBe(false);
  sessionStorage.setItem(PC_APP_KEY, '1');
  expect(showLanding('/', true)).toBe(false);
});

describe('홈', () => {
  it('PC 첫 화면: 탭 4개, 히어로, 문제, 해결 방법, 솔루션 카드 4개', async () => {
    asDesktop(true);
    show('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /내가 판단해요/ }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '기능' })).toHaveAttribute(
      'href',
      '/intro/features',
    );
    expect(within(nav).getByRole('link', { name: '다운로드' })).toHaveAttribute(
      'href',
      '/intro/download',
    );
    expect(within(nav).getByRole('link', { name: '팀 소개' })).toHaveAttribute(
      'href',
      '/intro/team',
    );
    expect(screen.getByRole('heading', { name: /왜 마트 앱을 열까요/ })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '안심하고 살 수 있는 시장을 만듭니다.' }),
    ).toBeInTheDocument();
    for (const name of ['오늘의 기준시세', '안심On', '파는 가게 안내', '레시피 · 손질 · 보관'])
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /솔루션 자세히 보기/ })).toHaveAttribute(
      'href',
      '/intro/features',
    );
    for (const link of screen.getAllByRole('link', { name: '휴대폰에 설치하기' }))
      expect(link).toHaveAttribute('href', '/intro/download');
    // 히어로 폰 2대는 지금 배포된 실제 화면
    expect(screen.getByRole('img', { name: /지도 홈 화면/ })).toHaveAttribute(
      'src',
      '/landing/map.webp',
    );
    // 오른쪽 폰: 노지 귤 가격표로 만든 안심On 화면(2026-11-27 요청)
    expect(screen.getAllByRole('img', { name: /^안심On 카드 화면: 노지 귤/ })[0]).toHaveAttribute(
      'src',
      '/landing/anshimon-mandarin.webp',
    );
    expect(screen.getAllByText('79,509원').length).toBeGreaterThan(0);
  });

  it('홈의 안심On 카드도 같은 노지 귤 화면이고, 판정어(살 만)는 쓰지 않는다', async () => {
    asDesktop(true);
    show('/');
    const shots = await screen.findAllByRole('img', { name: /^안심On 카드 화면: 노지 귤/ });
    // 히어로 오른쪽 폰 + 솔루션의 안심On 카드
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(pageText()).not.toMatch(/살 만/);
  });

  it('[웹페이지로 시작하기]는 이 탭에서 PC로도 앱을 열고 경동시장으로 간다', async () => {
    asDesktop(true);
    show('/');
    const [heroStart] = await screen.findAllByRole('link', { name: '웹페이지로 시작하기' });
    fireEvent.click(heroStart);
    expect(sessionStorage.getItem(PC_APP_KEY)).toBe('1');
    expect(where()).toBe('/?market=market%3Agyeongdong');
    expect(screen.queryByRole('heading', { level: 1, name: /내가 판단해요/ })).toBeNull();
  });

  it('머리말의 [웹으로 시작하기]도 같은 곳으로', async () => {
    asDesktop(true);
    show('/intro/team');
    const nav = await screen.findByRole('navigation', { name: '주요 메뉴' });
    const start = within(nav).getByRole('link', { name: '웹으로 시작하기' });
    expect(start).toHaveAttribute('href', '/?market=market%3Agyeongdong');
    fireEvent.click(start);
    expect(sessionStorage.getItem(PC_APP_KEY)).toBe('1');
    expect(where()).toBe('/?market=market%3Agyeongdong');
  });

  it('/intro는 휴대폰 폭에서도 소개 홈이고, 홈 탭은 /intro', async () => {
    show('/intro');
    expect(
      await screen.findByRole('heading', { level: 1, name: /내가 판단해요/ }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('href', '/intro');
  });

  it('PC에서도 로그인 화면은 그대로 열린다', async () => {
    asDesktop(true);
    show('/login');
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull();
  });
});

describe('기능', () => {
  it('목차 칩 11개가 섹션으로 이어지고, 기능 탭이 지금 탭이다', async () => {
    show('/intro/features');
    expect(
      await screen.findByRole('heading', { level: 1, name: '살펴보고, 고르고, 납득하고, 삽니다.' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(nav).getByRole('link', { name: '기능' })).toHaveAttribute('aria-current', 'page');
    const toc = screen.getByRole('navigation', { name: '기능 목차' });
    const ids = within(toc)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(ids).toEqual([
      '#anshimon',
      '#before',
      '#store',
      '#merchant',
      '#tools',
      '#after',
      '#why',
      '#trust',
      '#proof',
      '#impact',
      '#sources',
    ]);
    for (const id of ids) expect(document.getElementById(id!.slice(1))).not.toBeNull();
  });

  it('지금 숫자(52곳 · 949개 · 95개 · 106곳)와 기술 설명', async () => {
    show('/intro/features');
    await screen.findByRole('heading', { level: 1 });
    const text = pageText();
    expect(text).toContain('실제 상호 52곳');
    expect(screen.getAllByText('949개').length).toBeGreaterThan(0);
    expect(screen.getAllByText('106곳').length).toBeGreaterThan(0);
    expect(text).toContain('품목 95개, 품종 144개, 확인 포인트 40개');
    expect(text).toContain('근거 문서 79개, 출처 26곳');
    expect(text).toContain('Google Cloud Vision이 상품과 가격표 글자를 함께 읽어요');
    expect(text).toContain('학교 서버 Gemma가 먼저');
    expect(text).not.toMatch(/54곳|545개|마감세일|살 만/);
  });

  it('출처 표: Cloud Vision 행, Gemma · GPT 쓰는 곳, 바깥 링크는 새 탭', async () => {
    show('/intro/features');
    const table = await screen.findByRole('table', { name: '쓰는 자료와 API' });
    const row = (name: string) => within(table).getByRole('rowheader', { name }).closest('tr')!;
    expect(
      within(row('Google Cloud Vision')).getByText('사진 속 품목과 가격표 글자 읽기'),
    ).toBeInTheDocument();
    expect(within(row('Google Cloud Vision')).getByRole('link')).toHaveAttribute(
      'href',
      'https://cloud.google.com/vision',
    );
    expect(
      within(row('Gemma')).getByText('근거 안에서 답변 · 번역 (먼저 사용)'),
    ).toBeInTheDocument();
    expect(
      within(row('GPT')).getByText('Gemma가 답하지 못할 때 대신 답변 (Gemini 포함)'),
    ).toBeInTheDocument();
    const external = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('http'));
    expect(external.length).toBeGreaterThan(5);
    for (const a of external) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('확인 꼬리표와 예정 문구는 화면에 없다', async () => {
    show('/intro/features');
    await screen.findByRole('heading', { level: 1 });
    const text = pageText();
    expect(text).not.toMatch(/\[[^\]]*\]/);
    expect(text).not.toContain('교체 예정');
  });

  it('기능 영상: 모바일 실제 서비스를 녹화한 MP4·WebM과 포스터 8개', async () => {
    show('/intro/features');
    const video = await screen.findByLabelText(/^가게에서 노지 귤과 가격표를 찍으면/);
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('poster', '/landing/video/anshimon.webp');
    expect(video).toHaveProperty('muted', true);
    expect(document.querySelectorAll('video source[type="video/mp4"]')).toHaveLength(8);
    expect(document.querySelectorAll('video source[type="video/webm"]')).toHaveLength(8);
    expect(document.querySelector('img[src="/landing/result.webp"]')).toBeNull();
  });

  it('예전 기능별 주소는 기능 페이지의 섹션으로', async () => {
    const cases: [string, string][] = [
      ['map', '#store'],
      ['scan', '#anshimon'],
      ['prices', '#before'],
      ['card', '#anshimon'],
      ['shop', '#after'],
      ['merchants', '#merchant'],
      ['data', '#trust'],
      ['nope', ''],
    ];
    for (const [slug, hash] of cases) {
      show(`/intro/${slug}`);
      expect(
        await screen.findByRole('heading', { level: 1, name: /살펴보고/ }),
      ).toBeInTheDocument();
      expect(where()).toBe(`/intro/features${hash}`);
      cleanup();
    }
  });
});

describe('다운로드', () => {
  it('스토어 배지 없이 홈 화면에 추가하는 법 · 웹으로 시작 · QR', async () => {
    show('/intro/download');
    expect(
      await screen.findByRole('heading', { level: 1, name: /홈 화면에 추가해도/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /App Store|Google Play/ })).toBeNull();
    expect(screen.getByRole('heading', { name: '공유 → 홈 화면에 추가' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '메뉴 → 앱 설치 · 홈 화면에 추가' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '웹으로 바로 시작하기' })).toHaveAttribute(
      'href',
      '/?market=market%3Agyeongdong',
    );
    expect(
      screen.getByRole('img', { name: 'marketon.laea.io로 가는 QR 코드' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상인으로 시작하기' })).toHaveAttribute(
      'href',
      '/signup/merchant',
    );
    expect(screen.getByRole('link', { name: '우리 시장 입점 신청' })).toHaveAttribute(
      'href',
      '/join',
    );
  });

  it('홈 화면 설치와 웹 비교: 알림은 웹 푸시(로그인), iPhone은 홈 화면에 추가한 뒤', async () => {
    show('/intro/download');
    const table = await screen.findByRole('table', { name: '홈 화면 설치와 웹 비교' });
    expect(within(table).getByRole('columnheader', { name: '홈 화면 설치' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '웹' })).toBeInTheDocument();
    const alerts = within(table)
      .getByRole('rowheader', { name: '단골 가게 바겐세일 알림' })
      .closest('tr')!;
    expect(alerts.textContent).toMatch(/로그인 필요/);
    expect(alerts.textContent).toMatch(/iOS 16\.4/);
    expect(alerts.textContent).toMatch(/iPhone은 홈 화면에 추가해야 받아요/);
  });

  it('자주 묻는 질문은 펼침 목록, 사진 질문의 답', async () => {
    show('/intro/download');
    const q = await screen.findByText('찍은 사진은 어디에 쓰이나요?');
    expect(q.tagName).toBe('SUMMARY');
    expect(
      screen.getByText('품목과 가격표 글자를 읽는 데만 쓰고, 사진의 위치 정보는 지운 뒤 저장해요.'),
    ).toBeInTheDocument();
    expect(pageText()).not.toMatch(/\[[^\]]*\]/);
  });

  it('주소 복사: 복사하면 "복사했어요"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    show('/intro/download');
    fireEvent.click(await screen.findByRole('button', { name: '웹 주소 복사하기' }));
    expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SITE_START_URL);
  });
});

describe('팀 소개', () => {
  it('팀 소개 · 지도교수 · 역할 · 개발 과정(지금 숫자)', async () => {
    show('/intro/team');
    expect(await screen.findByRole('heading', { level: 1, name: /네 사람/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(nav).getByRole('link', { name: '팀 소개' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('신효영')).toBeInTheDocument();
    const text = pageText();
    expect(text).toContain('자동 테스트 949개 통과');
    expect(text).not.toContain('참가 서약');
    expect(text).not.toMatch(/\[[^\]]*\]/);
  });
});

describe('발표 모드', () => {
  it('다음·이전 섹션 머리 고르기', () => {
    // 머리까지 남은 거리: 지금 섹션(0), 아래 두 섹션
    expect(nextStop([-900, 0, 700, 1500], 1)).toBe(2);
    expect(nextStop([-900, 0, 700, 1500], -1)).toBe(0);
    // 긴 섹션 중간이면 ↑는 그 섹션 머리로
    expect(nextStop([-300, 500], -1)).toBe(0);
    // 마지막 섹션 뒤에는 없음
    expect(nextStop([-2000, -800], 1)).toBe(-1);
    // 화면보다 먼 머리는 한 화면씩
    expect(stepDistance(1800, 700)).toBe(700);
    expect(stepDistance(400, 700)).toBe(400);
    expect(stepDistance(-1800, 700)).toBe(-700);
  });
});

describe('FeatureVideo', () => {
  it('영상이 있으면 소리 없이 반복, 인라인 재생, 한 줄 설명', () => {
    const { container } = render(
      <FeatureVideo
        src="/landing/video/anshimon.mp4"
        webm="/landing/video/anshimon.webm"
        poster="/landing/card.webp"
        label="안심On 카드가 열리는 장면"
      />,
    );
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('aria-label', '안심On 카드가 열리는 장면');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('poster', '/landing/card.webp');
    expect(Array.from(video.querySelectorAll('source')).map((x) => x.getAttribute('src'))).toEqual([
      '/landing/video/anshimon.webm',
      '/landing/video/anshimon.mp4',
    ]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('움직임을 줄인 설정이면 자동 재생 대신 재생 버튼', () => {
    asDesktop(false, true);
    render(<FeatureVideo src="/landing/video/x.mp4" poster="/landing/card.webp" label="설명" />);
    expect(screen.getByRole('button', { name: '영상 재생' })).toBeInTheDocument();
  });
});
