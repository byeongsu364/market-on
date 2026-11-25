import { it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, renderHook, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { markets } from '../api/mock/data';
import * as api from '../api/marketRequests';
import * as auth from '../api/auth';
import * as marketApi from '../api/markets';
import * as mock from '../api/mock/marketRequests';
import { useSessionState } from '../store/session';
import type { Market } from '../types/contract';
const initialMarkets = structuredClone(markets);
const listed: Market = {
  market_id: 'market:listed',
  name: '등록 시장',
  status: 'listed',
  lat: 37.57,
  lng: 126.99,
  distance_m: 0,
};
const active: Market = {
  ...listed,
  market_id: 'market:active',
  name: '지원 시장',
  status: 'active',
  distance_m: 800,
};
afterEach(() => {
  vi.restoreAllMocks();
  markets.splice(0, markets.length, ...structuredClone(initialMarkets));
  mock.resetMarketRequests();
});
function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
it('가장 가까운 listed는 자동 선택하지 않고 홈에 요청 카드와 지원 시장을 표시한다', async () => {
  localStorage.removeItem('market');
  vi.spyOn(marketApi, 'getMarkets').mockResolvedValue([listed, active]);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 37.57, longitude: 126.99 } } as GeolocationPosition),
    },
  });
  const request = vi
    .spyOn(api, 'requestMarket')
    .mockResolvedValue({ requested: true, requests_7d: null });
  show('/');
  await screen.findByText('이 시장은 아직 Market-On에 없어요');
  fireEvent.click(screen.getByRole('button', { name: '이 시장도 쓰고 싶어요' }));
  await screen.findByText(/요청했어요 · 이번 주 5명 미만/);
  expect(request).toHaveBeenCalledWith(listed.market_id);
  expect(screen.getByRole('button', { name: '가까운 지원 시장 · 지원 시장' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '가까운 지원 시장 · 지원 시장' }));
  await screen.findByText(/지금 있는 시장 · 지원 시장/);
});
it('가까운 active만 자동 선택한다', async () => {
  localStorage.removeItem('market');
  vi.spyOn(marketApi, 'getMarkets').mockResolvedValue([active]);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 37.57, longitude: 126.99 } } as GeolocationPosition),
    },
  });
  const { result } = renderHook(() => useSessionState());
  await waitFor(() => expect(result.current.market?.status).toBe('active'));
  expect(result.current.automatic).toBe(true);
});
it('시장 목록은 지원 시장이 먼저 나오고 listed는 준비 중이다', async () => {
  vi.spyOn(marketApi, 'getMarkets').mockResolvedValue([listed, active]);
  show('/markets');
  await screen.findByText('준비 중');
  expect(
    screen
      .getByRole('button', { name: /지원 시장/ })
      .compareDocumentPosition(screen.getByText('준비 중')) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it('입점 검색·수요·신청 완료 뒤 pending 관리자가 로그인한다', async () => {
  markets.push({ ...listed });
  show('/join');
  fireEvent.change(await screen.findByLabelText('시장 이름'), { target: { value: '등록' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  fireEvent.click(await screen.findByRole('button', { name: '등록 시장' }));
  await screen.findByText('이번 주 이 시장 근처에서 Market-On을 연 사람 5명 미만');
  fireEvent.change(screen.getByLabelText('시장 공식 연락처'), { target: { value: '02-123-4567' } });
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'join_manager' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '입점 신청' }));
  await screen.findByText(/운영팀이 확인하면 시장 관리자 화면이 열려요/);
  const result = await auth.login({ login_id: 'join_manager', password: 'password123' });
  expect(result.user?.status).toBe('pending');
  expect(result.user?.role).toBe('market_admin');
});
it.each(['approve', 'reject'] as const)(
  '운영자 입점 %s는 확인하고 계정과 시장에 반영한다',
  async (decision) => {
    markets.push({ ...listed });
    const application = await mock.join({
      market_id: listed.market_id,
      manager_org: '상인회',
      contact: '02-123-4567',
      login_id: 'join_manager',
      password: 'password123',
    });
    await auth.login({ login_id: 'admin', password: 'market-on-demo' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const decide = vi.spyOn(api, 'decide');
    show('/admin');
    const heading = await screen.findByRole('heading', { name: listed.name });
    const button = within(heading.closest('article')!).getByRole('button', {
      name: decision === 'approve' ? '승인' : '거절',
    });
    fireEvent.click(button);
    expect(decide).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeEnabled());
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(decide).toHaveBeenCalledWith(application.id, decision));
    await waitFor(() =>
      expect(markets.find((m) => m.market_id === listed.market_id)!.status).toBe(
        decision === 'approve' ? 'active' : 'listed',
      ),
    );
    const result = await auth.login({ login_id: 'join_manager', password: 'password123' });
    expect(result.user?.status).toBe(decision === 'approve' ? 'approved' : 'rejected');
  },
);
it('pending 시장 관리자는 운영팀 확인 안내를 본다', async () => {
  vi.spyOn(auth, 'me').mockResolvedValue({
    user: {
      id: 'pending',
      login_id: 'pending',
      role: 'market_admin',
      status: 'pending',
      store: null,
      market: { market_id: listed.market_id, name: listed.name },
    },
  });
  show('/market-admin');
  await screen.findByText('운영팀이 확인하면 열려요');
});
