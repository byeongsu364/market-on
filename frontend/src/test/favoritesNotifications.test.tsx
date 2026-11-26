import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as accounts from '../api/mock/merchant';
import * as api from '../api/favorites';
import FavoriteButton from '../components/domain/FavoriteButton';
import { AuthProvider } from '../store/AuthProvider';

const customer = (id: string) =>
  accounts.signup({ login_id: id, password: 'password123', role: 'customer' });
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

it('단골과 알림 설정은 계정별이며 비로그인 저장은 막는다', async () => {
  await expect(
    api.saveFavorite({ store_id: 'store:A-05', name: '점포', market_id: 'market:demo' }),
  ).rejects.toThrow('손님 계정');
  await customer('first_customer');
  await api.saveFavorite({ store_id: 'store:A-05', name: '점포', market_id: 'market:demo' });
  await api.saveNotifySettings({ sales: false, season: false });
  await accounts.logout();
  await customer('other_customer');
  expect(await api.getFavorites()).toEqual([]);
  expect(await api.getNotifySettings()).toEqual({ sales: true, season: true });
  await accounts.logout();
  await accounts.login({ login_id: 'first_customer', password: 'password123' });
  expect(await api.getFavorites()).toHaveLength(1);
  expect(await api.getNotifySettings()).toEqual({ sales: false, season: false });
});

it('점포 시트의 별 버튼은 로그인 복귀 주소를 유지한다', async () => {
  render(
    <MemoryRouter initialEntries={['/?market=market:demo&store=store:A-05']}>
      <AuthProvider>
        <FavoriteButton storeId="store:A-05" name="점포" marketId="market:demo" />
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(screen.getByText('로그인하면 단골을 저장할 수 있어요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '단골 저장' }));
});

it('세일은 알림을 켠 단골 계정의 알림함과 종에 나타나며 읽음 처리된다', async () => {
  await customer('notice_customer');
  await api.saveFavorite({ store_id: 'store:A-05', name: '점포 A-05', market_id: 'market:demo' });
  await accounts.logout();
  await accounts.login(accounts.demoCredentials());
  await accounts.createSale({
    item_id: 'item:green_onion',
    sale_price: 1500,
    ends_at: new Date(Date.now() + 600000).toISOString(),
  });
  await accounts.logout();
  await accounts.login({ login_id: 'notice_customer', password: 'password123' });
  show('/me/notifications');
  expect(await screen.findByText(/1,500원 마감세일/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '알림 1개 안 읽음' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }));
  await waitFor(() =>
    expect(screen.getByRole('link', { name: '알림 0개 안 읽음' })).toBeInTheDocument(),
  );
  expect(await api.getNotifications(true)).toEqual([]);
});

it('점포별 알림을 끄면 알림이 오지 않고 다시 켤 수 있다', async () => {
  await customer('quiet_customer');
  await api.saveFavorite(
    { store_id: 'store:A-05', name: '점포 A-05', market_id: 'market:demo' },
    false,
  );
  await accounts.logout();
  await accounts.login(accounts.demoCredentials());
  await accounts.createSale({
    item_id: 'item:green_onion',
    sale_price: 1500,
    ends_at: new Date(Date.now() + 600000).toISOString(),
  });
  await accounts.logout();
  await accounts.login({ login_id: 'quiet_customer', password: 'password123' });
  expect(await api.getNotifications()).toEqual([]);
  show('/me/saved');
  const toggle = await screen.findByRole('switch', { name: '점포 A-05 알림' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: '점포 A-05 알림' })).toHaveAttribute(
      'aria-checked',
      'true',
    ),
  );
});

it('푸시 권한 거부를 Saved 화면에 안내한다', async () => {
  await customer('push_customer');
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('denied') });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  show('/me/saved');
  fireEvent.click(await screen.findByRole('button', { name: '알림 받기' }));
  expect(await screen.findByText(/알림 권한이 거부되었어요/)).toBeInTheDocument();
  vi.unstubAllGlobals();
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
});

it('알림 링크는 다른 출처나 역슬래시 우회를 열지 않는다', () => {
  expect(api.safeNoticeUrl('https://evil.example/x')).toBe('/me/notifications');
  expect(api.safeNoticeUrl('//evil.example/x')).toBe('/me/notifications');
  expect(api.safeNoticeUrl('/\\evil.example/x')).toBe('/me/notifications');
  expect(api.safeNoticeUrl('/s/store%3Aa?market=x')).toBe('/s/store%3Aa?market=x');
});
