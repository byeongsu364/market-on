import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { PC_APP_KEY, showLanding } from '../components/layout/desktopGate';

// PC(1024px 이상)는 손님 화면 대신 소개·브랜딩 페이지(2026-11-27)
function asDesktop(on: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: on && query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
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

it('PC로 첫 화면을 열면 소개·QR·이렇게 써요·상인 안내가 보인다', async () => {
  asDesktop(true);
  show('/');
  expect(
    await screen.findByRole('heading', { level: 1, name: /내가 판단해요/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '이렇게 써요' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /휴대폰으로 여는 QR 코드/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '상인으로 시작하기' })).toHaveAttribute(
    'href',
    '/signup/merchant',
  );
  expect(screen.getByRole('button', { name: /PC에서 그대로 써 보기/ })).toBeInTheDocument();
});

it('PC에서도 로그인 화면은 그대로 열린다', async () => {
  asDesktop(true);
  show('/login');
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '이렇게 써요' })).toBeNull();
});
