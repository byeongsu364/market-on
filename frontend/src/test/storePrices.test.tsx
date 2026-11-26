import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StorePriceDisplay from '../components/domain/StorePriceDisplay';
import MerchantPrices from '../components/domain/MerchantPrices';
import { SessionProvider } from '../store/SessionProvider';
import * as api from '../api/merchant';
const price = {
  price: 1800,
  unit: 'unit:piece',
  source: 'customers' as const,
  reporters: 3,
  latest_at: new Date().toISOString(),
  stale: false,
  merchant_confirmed: true,
};
it('손님·상인·빈 가격과 오래된 가격을 표시한다', () => {
  const { rerender } = render(<StorePriceDisplay price={price} />);
  expect(screen.getByText('1,800원 / 1개')).toBeInTheDocument();
  expect(screen.getByText(/손님 3명 확인/)).toBeInTheDocument();
  rerender(<StorePriceDisplay price={{ ...price, source: 'merchant', stale: true }} />);
  expect(screen.getByText(/상인 확인/).closest('.store-price')).toHaveClass('stale');
  rerender(<StorePriceDisplay price={null} />);
  expect(screen.getByText('가격 정보 준비 중')).toBeInTheDocument();
});
it('손님 가격을 그대로 확인 요청한다', async () => {
  vi.spyOn(api, 'getPrices').mockResolvedValue([
    { item_id: 'i', name: '대파', unit: price.unit, customers: price, my_confirmation: null },
  ]);
  const post = vi
    .spyOn(api, 'confirmPrice')
    .mockResolvedValue({ price: 1800, confirmed_at: price.latest_at });
  render(
    <SessionProvider>
      <MerchantPrices />
    </SessionProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /맞아요/ }));
  expect(post).toHaveBeenCalledWith({ item_id: 'i', unit: price.unit, price: 1800 });
  vi.restoreAllMocks();
});
it('내 확인 가격이 있으면 상인 확인 줄은 한 번만 보여 준다', async () => {
  vi.spyOn(api, 'getPrices').mockResolvedValue([
    {
      item_id: 'i',
      name: '대파',
      unit: price.unit,
      customers: price,
      my_confirmation: { price: 1800, confirmed_at: price.latest_at },
    },
  ]);
  render(
    <SessionProvider>
      <MerchantPrices />
    </SessionProvider>,
  );
  const label = await screen.findByText(/상인 확인 ·/);
  expect(label.tagName).toBe('P');
  expect(screen.queryByText('· 상인 확인')).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
it('시장 평균은 조사일을 표시하고 오래된 점포 가격 스타일을 쓰지 않는다', () => {
  render(
    <StorePriceDisplay
      price={{
        ...price,
        price: 2000,
        source: 'market_avg',
        observed_on: '2026-11-25',
        stale: true,
        merchant_confirmed: false,
      }}
    />,
  );
  expect(screen.getByText('2,000원 / 1개')).toBeInTheDocument();
  expect(screen.getByText('시장 평균 · aT 11월 25일 조사').closest('.store-price')).not.toHaveClass(
    'stale',
  );
  expect(screen.queryByText(/손님|상인 확인/)).not.toBeInTheDocument();
});

it('시장 평균은 지도와 판매 점포의 가격 눈금에 사용하지 않는다', async () => {
  const { storeBand, priceWho } = await import('../pages/map/helpers');
  const { SellingStores } = await import('../pages/scan/resultParts');
  const { MemoryRouter } = await import('react-router-dom');
  const { map, price: reference } = await import('../api/mock');
  const { t } = await import('../i18n');
  const stores = (await map('market:demo', 'item:apple')).stores.filter(
    (s) => s.price?.source === 'market_avg',
  );
  expect(stores.length).toBeGreaterThan(0);
  const current = await reference({
    market_id: 'market:demo',
    item_id: 'item:apple',
    unit: 'unit:piece',
  });
  expect(storeBand(stores[0], current)).toBeNull();
  expect(priceWho(stores[0].price!, t)).toMatch(/^시장 평균 · aT \d+월 \d+일 조사$/);
  const { container } = render(
    <MemoryRouter>
      <SessionProvider>
        <SellingStores
          stores={stores.slice(0, 1)}
          title="판매 점포"
          total={1}
          reference={9999}
          unit="unit:piece"
          map={null}
          mapHref="/"
          itemId="item:apple"
        />
      </SessionProvider>
    </MemoryRouter>,
  );
  expect(container.textContent).toContain('시장 평균');
  expect(container.querySelector('[data-on="true"]')).toBeNull();
});
