import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import App from '../App';
import * as accounts from '../api/mock/merchant';
import { saveFavorite } from '../api/favorites';

// live에서 키가 없거나 SDK·인증이 실패하면 MapView가 onFailure를 부름. 그 경우를 흉내 냄.
vi.mock('../components/map/MapView', () => ({
  default: ({ onFailure }: { onFailure?: (r: string) => void }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => onFailure?.('auth'), [onFailure]);
    return <div data-map="failed" />;
  },
}));
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

it('지도를 불러오지 못하면 Error 화면에서 다시 시도하거나 시장 목록으로 간다', async () => {
  show('/');
  expect(
    await screen.findByRole('heading', { name: '지도를 불러오지 못했어요' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '시장 목록으로 보기' })).toHaveAttribute(
    'href',
    '/markets',
  );
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
});

it('시장 안에서도 지도 실패면 Error 화면을 보인다', async () => {
  show('/?market=market:demo');
  expect(
    await screen.findByRole('heading', { name: '지도를 불러오지 못했어요' }),
  ).toBeInTheDocument();
});

it('점포에서 단골로 저장하면 단골 화면에 보이고 알림을 끄고 켠다', async () => {
  await accounts.signup({
    login_id: 'favorite_customer',
    password: 'password123',
    role: 'customer',
  });
  show('/s/store:A-05?market=market:demo');
  const save = await screen.findByRole('button', { name: '단골로 저장' });
  expect(screen.getByRole('link', { name: '이 가게에서 찍기' })).toHaveAttribute(
    'href',
    '/scan?market=market%3Ademo&store=store%3AA-05',
  );
  fireEvent.click(save);
  expect(await screen.findByRole('button', { name: '단골에서 빼기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('단골 화면은 저장한 점포와 알림 설정을 보인다', async () => {
  await accounts.signup({
    login_id: 'favorite_customer',
    password: 'password123',
    role: 'customer',
  });
  await saveFavorite({ store_id: 'store:A-05', name: '점포 A-05', market_id: 'market:demo' });
  show('/me/saved');
  expect(await screen.findByRole('heading', { name: '단골 점포', level: 1 })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /점포 A-05/ })).toHaveAttribute(
    'href',
    '/s/store%3AA-05?market=market%3Ademo',
  );
  const sales = await screen.findByRole('switch', { name: '단골 점포의 마감세일 알림' });
  expect(sales).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(sales);
  await waitFor(() => expect(sales).toHaveAttribute('aria-checked', 'false'));
  await waitFor(() =>
    expect(
      JSON.parse(
        localStorage.getItem(`mock-notify:${sessionStorage.getItem('mock-auth')}`) ?? 'null',
      ),
    ).toEqual({
      sales: false,
      season: true,
    }),
  );
});
