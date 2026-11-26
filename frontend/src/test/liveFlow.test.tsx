import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { getMarket, getMarkets } from '../api/markets';
import { recognize } from '../api/scan';
import { getPrice, getPriceHistory } from '../api/price';
import { postPriceReport } from '../api/priceReports';
import * as mock from '../api/mock';
vi.mock('../api/markets', () => ({
  getMarkets: vi.fn(),
  getMarket: vi.fn(),
  // 지도(MapView)와 시장 품목은 mock 그대로
  getPublicConfig: vi.fn(() => Promise.resolve({ naver_map_client_id: null })),
  getMarketItems: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../api/scan', () => ({ recognize: vi.fn() }));
// live 응답의 빈 시세는 숨긴다.
vi.mock('../api/price', () => ({ getPrice: vi.fn(), getPriceHistory: vi.fn(async () => null) }));
vi.mock('../api/priceReports', () => ({ postPriceReport: vi.fn() }));
const market = {
  status: 'active' as const,
  market_id: 'market:demo',
  name: '가까운 시장',
  lat: 37.57,
  lng: 126.99,
  distance_m: 500,
};
function show(path = '/', state?: object) {
  const [pathname, search = ''] = path.split('?');
  return render(
    <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}`, state }]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.mocked(getMarkets).mockReset().mockResolvedValue([market]);
  vi.mocked(getMarket).mockReset().mockResolvedValue(market);
  vi.mocked(getPrice).mockImplementation(mock.price);
  vi.mocked(getPriceHistory).mockReset().mockResolvedValue(null);
  vi.mocked(postPriceReport).mockReset().mockResolvedValue({ id: 1, updated: false, held: false });
  vi.mocked(recognize).mockReset();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});
function locate(denied = false) {
  localStorage.removeItem('market');
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        denied
          ? fail({ code: 1 } as GeolocationPositionError)
          : ok({ coords: { latitude: 37.57, longitude: 126.99 } } as GeolocationPosition),
    },
  });
}
it('1km 이내 시장을 자동으로 골라도 첫 화면은 지도 홈(시장 카드와 둘러보기)이다', async () => {
  locate();
  show();
  expect(await screen.findByRole('link', { name: '둘러보기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
  expect(getMarkets).toHaveBeenCalledWith(37.57, 126.99);
});
it.each([false, true])(
  '1km 밖이면 주변 시장 카드, 권한 거부면 시장 목록으로 안내한다 (%s)',
  async (denied) => {
    locate(denied);
    vi.mocked(getMarkets).mockResolvedValue([{ ...market, distance_m: 1001 }]);
    show();
    if (!denied) {
      // 위치로 주변 시장을 이미 찾았으면 첫 방문 안내 없이 가까운 시장 카드
      expect(await screen.findByRole('link', { name: '둘러보기' })).toHaveAttribute(
        'href',
        '/?market=market%3Ademo',
      );
      return;
    }
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치 사용하기' }));
    expect(
      await screen.findByRole('heading', { name: '위치를 확인하지 못했어요' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '시장 목록으로 보기' })).toHaveAttribute(
      'href',
      '/markets',
    );
  },
);
it('오늘 사용자가 선택한 시장을 위치보다 우선한다', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 37.6, longitude: 127.1 } } as GeolocationPosition),
    },
  });
  show('/search');
  expect(await screen.findByLabelText('시연 시장에서 품목 검색')).toBeInTheDocument();
  expect(getMarkets).not.toHaveBeenCalledWith(37.6, 127.1);
});
it('직접 입력은 가격을 넣으면 결과 진입과 점포 선택 때 제보한다', async () => {
  show('/scan?mode=manual');
  fireEvent.change(await screen.findByLabelText('품목'), { target: { value: '대파' } });
  expect(screen.getByRole('button', { name: '결과 보기' })).toBeDisabled();
  fireEvent.click(await screen.findByRole('radio', { name: '대파' }));
  fireEvent.change(screen.getByLabelText('가격 (선택)'), { target: { value: '3000' } });
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  await screen.findByRole('heading', { name: '대파' });
  await waitFor(() => expect(postPriceReport).toHaveBeenCalledTimes(1));
  expect(postPriceReport).toHaveBeenLastCalledWith(
    expect.objectContaining({ price: 3000, method: 'manual' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '점포 A-05' }));
  await waitFor(() => expect(postPriceReport).toHaveBeenCalledTimes(2));
  expect(postPriceReport).toHaveBeenLastCalledWith(
    expect.objectContaining({ store_id: 'store:A-05' }),
  );
});
it('직접 입력에서 가격을 비우면 제보하지 않고 확인 포인트만 보여 준다', async () => {
  show('/scan?mode=manual');
  fireEvent.change(await screen.findByLabelText('품목'), { target: { value: '대파' } });
  fireEvent.click(await screen.findByRole('radio', { name: '대파' }));
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  expect(
    await screen.findByRole('heading', { name: '가격을 넣으면 시세와 비교해 드려요' }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  expect(postPriceReport).not.toHaveBeenCalled();
});
async function photo(tag: boolean) {
  vi.mocked(recognize).mockResolvedValue({
    model: 'gemma4:e4b',
    vision_labels: ['green onion'],
    candidates: [{ item_id: 'item:green_onion', name: '대파', confidence: 0.94 }],
    media_id: '00000000-0000-4000-8000-000000000001',
    price_tag: tag
      ? { price: 3000, variety_id: null, unit_text: '1단', unit: null, quantity: 1 }
      : null,
  });
  show('/scan');
  fireEvent.change(await screen.findByLabelText('사진 찍기'), {
    target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: '결과 보기' })).toBeEnabled());
}
it.each([false, true])('가격표 유무에 따라 확인·제보한다 (%s)', async (tag) => {
  await photo(tag);
  if (tag) {
    expect(screen.getByText('3,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '고치기' }));
    expect(screen.getByLabelText('가격 (선택)')).toHaveValue(3000);
  } else {
    // 가격표가 없으면 가격과 품종을 묻지 않음
    expect(screen.queryByText('가격표에서 읽은 값')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('가격 (선택)')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  await screen.findByRole('heading', { name: '대파' });
  await screen.findByRole('heading', { name: '어느 가게예요?' });
  if (tag)
    await waitFor(() =>
      expect(postPriceReport).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'price_tag_photo',
          media_id: '00000000-0000-4000-8000-000000000001',
          unit: 'unit:bunch',
        }),
      ),
    );
  else expect(postPriceReport).not.toHaveBeenCalled();
});
it('503 인식 실패를 직접 입력으로 대체한다', async () => {
  vi.mocked(recognize).mockRejectedValue({ status: 503, message: 'unavailable' });
  show('/scan');
  fireEvent.change(await screen.findByLabelText('사진 찍기'), {
    target: { files: [new File(['x'], 'x.jpg')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '사진 인식이 잠시 안 돼요. 이름으로 찾아 주세요',
  );
  expect(await screen.findByLabelText('가격 (선택)')).toBeInTheDocument();
});
it('시세 404에서도 확인 포인트와 판매 점포를 보여 준다', async () => {
  vi.mocked(getPrice).mockRejectedValue({ status: 404 });
  show('/items/item:green_onion');
  await waitFor(() => expect(screen.getByText('기준시세가 아직 없어요')).toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '점포 A-05' })).toBeInTheDocument(),
  );
});

it('시장 API 실패면 오류와 시장 목록 링크를 보인다', async () => {
  locate();
  vi.mocked(getMarkets).mockRejectedValue(new Error('offline'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: '현재 위치 사용하기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  expect(screen.getByRole('link', { name: '시장 목록으로 보기' })).toHaveAttribute(
    'href',
    '/markets',
  );
});
it('어제 선택한 시장은 새 위치로 다시 확인한다', async () => {
  localStorage.setItem('market-day', JSON.stringify('2000-01-01'));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 37.57, longitude: 126.99 } } as GeolocationPosition),
    },
  });
  show();
  // 새 위치로 다시 고른 시장이 지도 홈의 가까운 시장 카드로 나옴(첫 화면은 시장 안으로 바로 들어가지 않음)
  expect(await screen.findByRole('link', { name: '둘러보기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
});
it('가격 제보 실패에도 결과 화면을 유지한다', async () => {
  vi.mocked(postPriceReport).mockRejectedValue(new Error('offline'));
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    show('/items/item:green_onion', { price: 3000, method: 'manual' });
    expect(await screen.findByRole('heading', { name: '대파' })).toBeInTheDocument();
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(
      await screen.findByRole('heading', { name: '이 시장에서 대파 파는 곳' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/인식 라벨/)).not.toBeInTheDocument();
  } finally {
    log.mockRestore();
  }
});
it('QR에서 고른 점포는 사진 결과의 최초 제보에 포함한다', async () => {
  vi.mocked(recognize).mockResolvedValue({
    model: 'gemma4:e4b',
    vision_labels: [],
    candidates: [{ item_id: 'item:green_onion', name: '대파', confidence: 0.9 }],
    media_id: '00000000-0000-4000-8000-000000000001',
    price_tag: { price: 3000, variety_id: null, unit_text: '3단', unit: 'unit:bunch', quantity: 3 },
  });
  show('/s/store:A-05');
  fireEvent.click(await screen.findByRole('link', { name: '이 가게에서 찍기' }));
  fireEvent.change(await screen.findByLabelText('사진 찍기'), {
    target: { files: [new File(['x'], 'photo.jpg')] },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: '결과 보기' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  await waitFor(() =>
    expect(postPriceReport).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store:A-05',
        price: 3000,
        quantity: 3,
      }),
    ),
  );
  expect(getPrice).toHaveBeenLastCalledWith(expect.objectContaining({ seen_price: 1000 }));
});
it('사진 저장에 실패해 media_id가 없으면 유효하지 않은 사진 제보를 보내지 않는다', async () => {
  show('/items/item:green_onion', { price: 3000, method: 'price_tag_photo', media_id: null });
  await screen.findByRole('button', { name: '점포 A-05' });
  expect(postPriceReport).not.toHaveBeenCalled();
});

it('결과 판매 점포에 손님·상인·미등록 가격을 표시한다', async () => {
  const storesApi = await import('../api/stores');
  const map = await mock.map('market:demo', 'item:green_onion', 'unit:bunch');
  const base = {
    price: 1800,
    unit: 'unit:bunch',
    reporters: 3,
    latest_at: new Date().toISOString(),
    stale: false,
    merchant_confirmed: true,
  };
  const sellers = map.stores.filter((s) => s.highlight);
  sellers[0].price = { ...base, source: 'customers' };
  sellers[1].price = { ...base, price: 2000, source: 'merchant', reporters: 0, stale: true };
  sellers[2].price = null;
  const spy = vi.spyOn(storesApi, 'getMarketMap').mockResolvedValue(map);
  try {
    show('/items/item:green_onion', { method: 'manual' });
    expect(await screen.findByText('1,800원 / 1단')).toBeInTheDocument();
    expect(screen.getByText(/손님 3명 확인/)).toBeInTheDocument();
    expect(screen.getByText('2,000원 / 1단').closest('.store-price')).toHaveClass('stale');
    expect(screen.getByText('가격 정보 준비 중')).toBeInTheDocument();
    expect(screen.queryByText(/인식 라벨/)).not.toBeInTheDocument();
  } finally {
    spy.mockRestore();
  }
});

it('기본 품종 칩을 표시하고 선택한 품종으로 시세를 다시 요청한다', async () => {
  show('/items/item:apple');
  const fuji = await screen.findByRole('button', { name: '후지' });
  expect(fuji).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('품종은 가격표나 상인에게 확인해 주세요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '홍로' }));
  await waitFor(() =>
    expect(getPrice).toHaveBeenLastCalledWith(
      expect.objectContaining({ variety_id: 'variety:apple-hongro' }),
    ),
  );
  expect(await screen.findByRole('button', { name: '홍로' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByText('품종을 바꾸면 결론과 기준시세가 함께 바뀌어요.')).toBeInTheDocument();
});

it('가격표 품종을 확인·수정하고 결과의 기본 품종보다 우선한다', async () => {
  vi.mocked(recognize).mockResolvedValue({
    model: 'fake',
    vision_labels: ['apple'],
    candidates: [{ item_id: 'item:apple', name: '사과', confidence: 0.94 }],
    media_id: null,
    price_tag: {
      price: 5000,
      unit_text: '홍로 3개',
      quantity: 3,
      unit: 'unit:piece',
      variety_id: 'variety:apple-hongro',
    },
  });
  show('/scan');
  fireEvent.change(await screen.findByLabelText('사진 찍기'), {
    target: { files: [new File(['x'], 'apple.jpg')] },
  });
  expect(await screen.findByText('가격표에서 홍로로 읽었어요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '홍로' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '후지' }));
  expect(screen.getByRole('button', { name: '후지' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '홍로' }));
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  await waitFor(() =>
    expect(getPrice).toHaveBeenLastCalledWith(
      expect.objectContaining({ variety_id: 'variety:apple-hongro' }),
    ),
  );
  expect(await screen.findByRole('button', { name: '홍로' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // 손님이 다시 고른 품종이라 가격표 문구 대신 바꾸는 안내
  expect(screen.getByText('품종을 바꾸면 결론과 기준시세가 함께 바뀌어요.')).toBeInTheDocument();
});

it('단일 품종은 칩을 표시하지 않는다', async () => {
  show('/items/item:green_onion');
  await screen.findByText(/aT 기간별/);
  expect(screen.queryByRole('group', { name: '품종' })).not.toBeInTheDocument();
  expect(screen.queryByText('품종은 가격표나 상인에게 확인해 주세요')).not.toBeInTheDocument();
});

it('판매 점포는 5곳부터 펼치고 추정 품목을 표시한다', async () => {
  const storesApi = await import('../api/stores');
  const map = await mock.map('market:demo', 'item:green_onion');
  map.stores = map.stores.slice(0, 8).map((s) => ({
    ...s,
    highlight: true,
    source: 'sbiz',
    items_basis: 'sbiz_guess',
    guessed_item_ids: ['item:green_onion'],
  }));
  const spy = vi.spyOn(storesApi, 'getMarketMap').mockResolvedValue(map);
  try {
    const { container } = show('/items/item:green_onion', { method: 'manual' });
    await waitFor(() => expect(container.querySelectorAll('#selling-stores li')).toHaveLength(5));
    expect(screen.getAllByText('업종 기준 · 상인 확인 전')).toHaveLength(5);
    fireEvent.click(
      within(container.querySelector('#selling-stores') as HTMLElement).getByRole('button', {
        name: '더 보기',
      }),
    );
    await waitFor(() => expect(container.querySelectorAll('#selling-stores li')).toHaveLength(8));
  } finally {
    spy.mockRestore();
  }
});

it('서버 품종 설명·수확 시기·최근 4주 그래프를 결과에 표시한다', async () => {
  vi.mocked(getPriceHistory).mockResolvedValue({
    item_id: 'item:apple',
    variety_id: 'variety:apple-fuji',
    unit: 'unit:piece',
    source: 'aT 주별 평균',
    points: [
      { week_start: '2026-11-02', price: 3000 },
      { week_start: '2026-11-09', price: null },
      { week_start: '2026-11-16', price: 3200 },
      { week_start: '2026-11-23', price: 3100 },
    ],
  });
  show('/items/item:apple?market=market:demo', { price: 2300, quantity: 1 });
  expect(
    await screen.findByText(/완전히 익으면 과육 속에 꿀이 생기고 저장성이 좋아요/),
  ).toBeInTheDocument();
  expect(screen.getByText('수확 시기 · 10월 하순 이후')).toBeInTheDocument();
  expect(await screen.findByText('aT 주별 평균')).toBeInTheDocument();
  expect(getPriceHistory).toHaveBeenCalledWith(
    'item:apple',
    'variety:apple-fuji',
    'each',
    'market:demo',
  );
});

it('보류된 제보는 기준시세 차이 안내를 표시한다', async () => {
  vi.mocked(postPriceReport).mockResolvedValue({ id: 1, updated: false, held: true });
  show('/items/item:green_onion?market=market:demo', { price: 3000, method: 'manual' });
  expect(await screen.findByText('기준시세와 차이가 커서 확인 후 반영돼요')).toBeInTheDocument();
});
