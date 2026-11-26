import { beforeEach, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// 기기 언어는 한국어로(jsdom 기본은 en-US). 영어 기기는 마지막 테스트에서 확인
const deviceLanguage = (tag: string) =>
  Object.defineProperty(navigator, 'language', { configurable: true, get: () => tag });
beforeEach(() => deviceLanguage('ko-KR'));

// 처음 온 손님: 언어 고르기 → 단계별 안내 3장(2026-11-27)
const show = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

it('처음이면 언어부터 고르고, 고른 언어로 안내 3장을 넘긴 뒤 앱으로 간다', async () => {
  localStorage.removeItem('welcomed');
  show();
  expect(await screen.findByRole('heading', { name: '언어를 골라 주세요' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  expect(screen.getByRole('heading', { name: 'Choose your language' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(
    screen.getByRole('heading', { name: 'Find a traditional market on the map' }),
  ).toBeInTheDocument();
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(
    screen.getByRole('heading', { name: 'Snap, compare, and decide yourself' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
  expect(screen.queryByText('3 / 3')).toBeNull();
  expect(localStorage.getItem('welcomed')).toBe('1');
  expect(JSON.parse(localStorage.getItem('language') ?? '""')).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});

it('건너뛰기로 바로 앱, 다음부터는 다시 묻지 않는다', async () => {
  localStorage.removeItem('welcomed');
  const first = show();
  fireEvent.click(await screen.findByRole('button', { name: '계속' }));
  fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
  expect(screen.queryByRole('heading', { name: '언어를 골라 주세요' })).toBeNull();
  first.unmount();
  show();
  expect(screen.queryByRole('heading', { name: '언어를 골라 주세요' })).toBeNull();
});

it('상인·로그인 화면은 처음이어도 안내 없이 연다', async () => {
  localStorage.removeItem('welcomed');
  show('/login');
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '언어를 골라 주세요' })).toBeNull();
});

it('기기 언어가 영어면 영어가 미리 골라져 버튼도 영어로 나온다', async () => {
  localStorage.removeItem('welcomed');
  deviceLanguage('en-US');
  show();
  expect(await screen.findByRole('heading', { name: 'Choose your language' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
});
