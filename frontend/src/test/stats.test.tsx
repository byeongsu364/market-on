import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteSheet from '../components/domain/RouteSheet';
import App from '../App';
import { SessionProvider } from '../store/SessionProvider';
afterEach(() => vi.restoreAllMocks());
import { MemoryRouter } from 'react-router-dom';
import * as storesApi from '../api/stores';
import * as merchantApi from '../api/merchant';
import * as adminApi from '../api/admin';
import * as managerApi from '../api/marketAdmin';
import * as mock from '../api/mock/merchant';
import { seoulDay } from '../utils/sale';

it('네이버·카카오 길 안내 클릭은 기록하며 실패해도 링크를 유지한다', async () => {
  const record = vi.spyOn(storesApi, 'recordDirections').mockRejectedValue(new Error('offline'));
  render(
    <SessionProvider>
      <RouteSheet
        destination={{ name: '점포', lat: 37.5, lng: 127 }}
        kind="store"
        storeId="store:A-05"
        onClose={() => {}}
      />
    </SessionProvider>,
  );
  const links = screen.getAllByRole('link');
  for (const link of links) {
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
  }
  await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
  expect(record).toHaveBeenCalledWith('store:A-05');
  expect(links[0]).toHaveAttribute('href', expect.stringContaining('map.naver.com'));
  expect(links[1]).toHaveAttribute('href', expect.stringContaining('map.kakao.com'));
});

it('시장 길 안내는 점포 통계를 기록하지 않는다', () => {
  const record = vi.spyOn(storesApi, 'recordDirections').mockResolvedValue(undefined);
  render(
    <SessionProvider>
      <RouteSheet
        destination={{ name: '시장', lat: 37.5, lng: 127 }}
        kind="market"
        onClose={() => {}}
      />
    </SessionProvider>,
  );
  const link = screen.getAllByRole('link')[1];
  link.addEventListener('click', (e) => e.preventDefault());
  fireEvent.click(link);
  expect(record).not.toHaveBeenCalled();
});

it('상인 홈은 조회·길 안내 숫자와 날짜별 그래프를 표시하고 단골은 숨긴다', async () => {
  await mock.login(mock.demoCredentials());
  vi.spyOn(merchantApi, 'getStats').mockResolvedValue({
    today: { views: 38, directions: 5 },
    days: [{ day: '2026-11-27', views: 38, directions: 5 }],
    favorites: null,
  });
  render(
    <MemoryRouter initialEntries={['/merchant']}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText('오늘 38번 조회')).toBeInTheDocument();
  expect(screen.getByText('5회')).toBeInTheDocument();
  expect(screen.getByText('38회 조회')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '날짜별 조회 수와 길 안내 횟수' })).toBeInTheDocument();
  expect(screen.queryByText('단골 수')).not.toBeInTheDocument();
});

it('mock 통계는 점포·세일 조회를 합산하고 길 안내를 10분 중복 제외한다', async () => {
  await mock.login(mock.demoCredentials());
  await mock.publicStore('store:A-05');
  await mock.view(mock.sales[0].id);
  await mock.direction('store:A-05');
  await mock.direction('store:A-05');
  const stats = await merchantApi.getStats();
  expect(stats.today).toEqual({ views: 2, directions: 1 });
  expect(stats.days).toHaveLength(7);
  expect(stats.days.at(-1)?.day).toBe(seoulDay());
  expect(stats.favorites).toBeNull();
});

it('mock 운영자 목록과 시장 관리자 통계는 역할과 응답 계약을 따른다', async () => {
  await expect(adminApi.getListedMarkets()).rejects.toThrow();
  await mock.login(mock.demoCredentials('admin'));
  const active = await adminApi.getActiveMarkets();
  expect(active[0]).toMatchObject({
    stores: expect.any(Number),
    merchants_approved: expect.any(Number),
    views_week: expect.any(Number),
  });
  const listed = await adminApi.getListedMarkets();
  expect(listed.every((m) => m.application === null)).toBe(true);
  await mock.logout();
  await expect(managerApi.getStats()).rejects.toThrow();
});

it('시장 관리자 숫자와 승인 상인의 최근 활동을 표시한다', async () => {
  const auth = await import('../api/auth');
  vi.spyOn(auth, 'me').mockResolvedValue({
    user: {
      id: 'manager',
      login_id: 'manager',
      role: 'market_admin',
      status: 'approved',
      store: null,
      market: { market_id: 'market:demo', name: '시연 시장' },
    },
  });
  vi.spyOn(managerApi, 'getStats').mockResolvedValue({
    stores: 12,
    merchants_approved: 8,
    merchants_pending: 2,
    views_week: 123,
    recent: [
      {
        user_id: 'merchant',
        login_id: 'seller',
        store_id: 'store:A-05',
        store_name: '시험 점포',
        last_sale_at: '2026-11-27T10:00:00+09:00',
        sales_week: 3,
      },
    ],
  });
  render(
    <MemoryRouter initialEntries={['/market-admin']}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText('12곳')).toBeInTheDocument();
  expect(screen.getByText('123번')).toBeInTheDocument();
  expect(screen.getByRole('row', { name: /seller 시험 점포/ })).toBeInTheDocument();
});

it('운영자는 신청이 없는 요청 시장만 표시하고 활성 시장 통계를 표시한다', async () => {
  await mock.login(mock.demoCredentials('admin'));
  vi.spyOn(adminApi, 'getListedMarkets').mockResolvedValue([
    {
      market_id: 'one',
      name: '요청만 있는 시장',
      requests_week: 7,
      requests_total: 10,
      application: null,
    },
    {
      market_id: 'two',
      name: '이미 신청한 시장',
      requests_week: 8,
      requests_total: 12,
      application: { status: 'pending', created_at: '2026-11-27T00:00:00Z' },
    },
    {
      market_id: 'three',
      name: '요청 없는 시장',
      requests_week: 0,
      requests_total: 0,
      application: null,
    },
  ]);
  vi.spyOn(adminApi, 'getActiveMarkets').mockResolvedValue([
    { market_id: 'four', name: '서비스 시장', stores: 12, merchants_approved: 8, views_week: 123 },
  ]);
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('row', { name: '요청만 있는 시장 7 10' })).toBeInTheDocument();
  expect(screen.queryByText('이미 신청한 시장')).not.toBeInTheDocument();
  expect(screen.queryByText('요청 없는 시장')).not.toBeInTheDocument();
  expect(screen.getByRole('row', { name: '서비스 시장 12 8 123' })).toBeInTheDocument();
});
