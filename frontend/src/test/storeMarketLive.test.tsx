import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { request } from '../api/client';
import { getExtras, saveLocation } from '../api/merchant';
import { getMarket } from '../api/markets';
import { getMarketMap } from '../api/stores';
import StoreEdit from '../pages/merchant/StoreEdit';
import { storeCategory } from '../utils/category';
vi.mock('../api/client', async (original) => ({
  ...(await original<typeof import('../api/client')>()),
  isMock: false,
  request: vi.fn(),
}));
vi.mock('../store/session', () => ({ useSession: () => ({ language: 'ko' }) }));
const store = {
  store_id: 'store:live',
  name: '실제 점포',
  market_id: 'market:live',
  hours: { open: '09:00', close: '20:00' },
  item_ids: ['item:apple'],
  payments: ['card'],
  intro: '서버에서 받은 소개',
  today_views: 0,
  sale_views: 0,
  location: { lat: 37.57, lng: 127 },
  location_confirmed: true,
};
beforeEach(() => {
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async (path) => {
      if (path === '/merchant/store') return store;
      if (path === '/merchant/stats?days=7')
        return { favorites: 0, today: { views: 0, directions: 0 }, days: [] };
      if (path.startsWith('/items/search')) return [{ item_id: 'item:apple', name: '사과' }];
      throw new Error(`Unexpected request: ${path}`);
    });
});
it('live 결제 수단과 소개를 표시하고 PATCH로 저장한다', async () => {
  render(
    <MemoryRouter>
      <StoreEdit />
    </MemoryRouter>,
  );
  expect(await screen.findByDisplayValue('서버에서 받은 소개')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '카드' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '바꾼 소개' } });
  fireEvent.click(screen.getByRole('button', { name: '현금' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/merchant/store', {
      method: 'PATCH',
      body: JSON.stringify({
        hours: store.hours,
        item_ids: store.item_ids,
        payments: ['card', 'cash'],
        intro: '바꾼 소개',
        varieties: {},
      }),
    }),
  );
});
it('live 위치는 PUT으로 저장하고 품절·단골 값을 만들지 않는다', async () => {
  expect(await getExtras()).toEqual({
    favorites: 0,
    location: store.location,
    location_confirmed: true,
  });
  vi.mocked(request).mockResolvedValue(store);
  expect(await saveLocation(store.location)).toEqual({
    location: store.location,
    location_confirmed: true,
  });
  expect(request).toHaveBeenCalledWith('/merchant/store/location', {
    method: 'PUT',
    body: JSON.stringify(store.location),
  });
});
it('시장 상세와 손님 좌표가 있는 지도 응답을 유지한다', async () => {
  const market = {
    market_id: 'market:live',
    address: '시장 주소',
    store_count: 3,
    requests: 2,
    amenities: null,
  };
  vi.mocked(request).mockResolvedValueOnce(market);
  expect(await getMarket('market:live')).toEqual(market);
  const map = {
    stores: [
      {
        lat: 37.57,
        lng: 127,
        category: 'store_category:produce',
        open_now: true,
        verified: true,
        distance_m: 3,
        intro: '소개',
        payments: ['card'],
      },
    ],
  };
  vi.mocked(request).mockResolvedValueOnce(map);
  expect(await getMarketMap('market:live', undefined, undefined, 37.57, 127)).toEqual(map);
  expect(request).toHaveBeenLastCalledWith('/markets/market%3Alive/map?lat=37.57&lng=127');
});

it('서버 카테고리 id를 지도 카테고리로 바꾼다', () => {
  expect(storeCategory({ category: 'store_category:side_dish' })).toBe('side');
  expect(storeCategory({ category: 'store_category:snack' })).toBe('ricecake');
});
it('live 점포 품종을 품목별로 고르고 저장한다', async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === '/items/search?q=') return [{ item_id: 'item:apple', name: '사과' }];
    if (path === '/items/item%3Aapple/varieties')
      return [{ variety_id: 'variety:apple-fuji', name: '후지' }];
    return store;
  });
  render(
    <MemoryRouter>
      <StoreEdit />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '후지' }));
  expect(screen.getByRole('button', { name: '후지' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/merchant/store', {
      method: 'PATCH',
      body: JSON.stringify({
        hours: store.hours,
        item_ids: store.item_ids,
        payments: store.payments,
        intro: store.intro,
        varieties: { 'item:apple': ['variety:apple-fuji'] },
      }),
    }),
  );
});
