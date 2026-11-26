import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as auth from '../api/auth';
import * as api from '../api/marketAdmin';
import * as markets from '../api/markets';
import { useSessionState } from '../store/session';
import type { User } from '../types/contract';
const manager: User = {
  id: 'manager',
  login_id: 'manager',
  role: 'market_admin',
  status: 'approved',
  store: null,
  market: { market_id: 'market:test', name: '시험시장' },
};
it('시장 관리자는 승인하고 거절 전에 확인한다', async () => {
  vi.spyOn(auth, 'me').mockResolvedValue({ user: manager });
  vi.spyOn(api, 'getMarket').mockResolvedValue({
    market_id: 'market:test',
    name: '시험시장',
    stores_total: 2,
    merchants_approved: 0,
    merchants_pending: 1,
    views_7d: 9,
  });
  vi.spyOn(api, 'getMerchants').mockImplementation(async (status) =>
    status === 'pending'
      ? [
          {
            id: 'one',
            login_id: 'merchant',
            status: 'pending',
            created_at: new Date().toISOString(),
            store: { store_id: 'store:one', name: '점포 하나' },
          },
        ]
      : [],
  );
  const decide = vi.spyOn(api, 'decide').mockResolvedValue({ user: manager });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(
    <MemoryRouter initialEntries={['/market-admin']}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '거절' }));
  expect(confirm).toHaveBeenCalled();
  expect(decide).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: '거절' })).toBeEnabled());
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: '거절' }));
  await waitFor(() => expect(decide).toHaveBeenCalledWith('one', 'reject'));
  await waitFor(() => expect(screen.getByRole('button', { name: '승인' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  await waitFor(() => expect(decide).toHaveBeenCalledWith('one', 'approve'));
  // 화면을 먼저 내려야 matchMedia 가짜 함수가 풀린 뒤 다시 그리지 않음
  cleanup();
  vi.restoreAllMocks();
});
it('QR 시장은 저장된 시장보다 우선하고 그날 유지된다', async () => {
  window.history.replaceState({}, '', '/?market=market:test');
  const market = {
    status: 'active' as const,
    market_id: 'market:test',
    name: '시험시장',
    distance_m: null,
    lat: 0,
    lng: 0,
  };
  vi.spyOn(markets, 'getMarket').mockResolvedValue(market);
  const { result, unmount } = renderHook(() => useSessionState());
  await waitFor(() => expect(result.current.market?.market_id).toBe('market:test'));
  expect(result.current.automatic).toBe(false);
  unmount();
  window.history.replaceState({}, '', '/');
  const again = renderHook(() => useSessionState());
  expect(again.result.current.market?.market_id).toBe('market:test');
  vi.restoreAllMocks();
});
it.each(['merchant', 'market_admin', 'operator'] as const)(
  '공용 로그인은 %s 역할의 홈으로 이동한다',
  async (role) => {
    vi.spyOn(auth, 'me').mockResolvedValue({ user: null } as never);
    vi.spyOn(auth, 'login').mockResolvedValue({ user: { ...manager, role } });
    vi.spyOn(api, 'getMarket').mockResolvedValue({
      market_id: 'market:test',
      name: '시험시장',
      stores_total: 0,
      merchants_approved: 0,
      merchants_pending: 0,
      views_7d: 0,
    });
    vi.spyOn(api, 'getMerchants').mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/merchant/login']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'manager' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    if (role === 'market_admin') {
      await screen.findByRole('heading', { name: '승인 대기 상인' });
      expect(screen.getByRole('link', { name: '시장 입구 QR 포스터' })).toHaveAttribute(
        'href',
        '/market-admin/poster',
      );
    } else if (role === 'operator') await screen.findByRole('heading', { name: '상인 승인' });
    else await screen.findByRole('link', { name: '마감세일 올리기' });
    vi.restoreAllMocks();
  },
);
it('시장 입구 포스터는 시장 URL의 QR을 표시한다', async () => {
  vi.spyOn(auth, 'me').mockResolvedValue({ user: manager });
  vi.spyOn(api, 'getMarketPoster').mockResolvedValue({
    market_name: '시험시장',
    url: 'http://localhost/?market=market%3Atest',
  });
  const { container } = render(
    <MemoryRouter initialEntries={['/market-admin/poster']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '사진 한 장으로 어디서 파는지 바로' });
  await waitFor(() => expect(container.querySelector('.poster-qr svg')).toBeTruthy());
  vi.restoreAllMocks();
});
