import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const desktop = () =>
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('min-width: 1024px'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });

it('내 정보: 손님은 로그인 없이 쓰고, 상인·시장 입구가 있다', async () => {
  show('/me');
  expect(await screen.findByRole('heading', { name: '내 정보' })).toBeInTheDocument();
  expect(screen.getByText('손님은 로그인 없이도 모든 기능을 쓸 수 있어요.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: /상인으로 시작하기/ })).toHaveAttribute(
    'href',
    '/signup/merchant',
  );
  expect(screen.getByRole('link', { name: /우리 시장 입점 신청/ })).toHaveAttribute(
    'href',
    '/join',
  );
  fireEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }));
  expect(screen.getByRole('dialog', { name: '홈 화면에 추가' })).toBeInTheDocument();
});

it('언어와 화면: 언어·글자 크기·테마를 바꾸고 기억한다', async () => {
  show('/me/settings');
  const english = await screen.findByRole('radio', { name: /English/ });
  fireEvent.click(english);
  expect(english).toBeChecked();
  expect(document.documentElement.lang).toBe('en');
  fireEvent.click(screen.getByRole('button', { name: '크게' }));
  expect(document.documentElement.dataset.textSize).toBe('large');
  expect(JSON.parse(localStorage.getItem('text-size')!)).toBe('large');
  fireEvent.click(screen.getByRole('button', { name: '다크' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('로그인: 틀리면 오류를 보이고, 맞으면 역할별 화면으로 간다', async () => {
  show('/login');
  fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'demo_a05' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('아이디와 비밀번호를 확인해 주세요.');
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'market-on-demo' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(screen.queryByLabelText('비밀번호')).toBeNull());
  expect(sessionStorage.getItem('mock-auth')).toBe('demo_a05');
});

it('회원가입(mock): 손님 계정을 만들고 내 정보에 이름이 보인다', async () => {
  show('/signup?next=%2Fme');
  const role = await screen.findByRole('radiogroup', { name: '어떻게 쓰실 건가요?' });
  expect(within(role).getByRole('radio', { name: '손님' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'guest_01' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password-1' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password-2' } });
  expect(screen.getByText('비밀번호가 서로 달라요.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password-1' } });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('약관에 동의해 주세요.');
  fireEvent.click(
    screen.getByRole('checkbox', { name: '이용약관과 개인정보 처리방침에 동의해요' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  expect(await screen.findByText('guest_01')).toBeInTheDocument();
  expect(screen.getByText('손님')).toBeInTheDocument();
});

it('회원가입: 상인은 내 점포 고르기, 시장 관리자는 입점 신청으로 이어진다', async () => {
  show('/signup');
  fireEvent.click(await screen.findByRole('radio', { name: '상인' }));
  expect(screen.getByRole('link', { name: '다음' })).toHaveAttribute('href', '/signup/merchant');
  fireEvent.click(screen.getByRole('radio', { name: '시장 관리자' }));
  expect(screen.getByRole('link', { name: '다음' })).toHaveAttribute('href', '/join');
});

it('PC 로그인은 머리말 없이 왼쪽 브랜드 면과 오른쪽 폼', async () => {
  desktop();
  show('/login');
  expect(await screen.findByRole('heading', { name: '로그인', level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole('search')).toBeNull();
  expect(screen.getByText('기준시세와 비교해 보고, 시장에서 바로 확인해요')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup');
});
