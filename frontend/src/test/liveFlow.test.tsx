import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { getMarkets } from '../api/markets';
import { recognize } from '../api/scan';
import { getPrice } from '../api/price';
import { postPriceReport } from '../api/priceReports';
import * as mock from '../api/mock';
vi.mock('../api/markets', () => ({ getMarkets: vi.fn() }));
vi.mock('../api/scan', () => ({ recognize: vi.fn() }));
vi.mock('../api/price', () => ({ getPrice: vi.fn() }));
vi.mock('../api/priceReports', () => ({ postPriceReport: vi.fn() }));
const market = {
  market_id: 'market:demo',
  name: '가까운 시장',
  lat: 37.57,
  lng: 126.99,
  distance_m: 500,
};
function show(path = '/', state?: object) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.mocked(getMarkets).mockReset().mockResolvedValue([market]);
  vi.mocked(getPrice).mockImplementation(mock.price);
  vi.mocked(postPriceReport).mockReset().mockResolvedValue({ id: 1, updated: false });
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
it('1km 이내 시장을 자동으로 선택한다', async () => {
  locate();
  show();
  expect(await screen.findByText(/지금 있는 시장 · 가까운 시장/)).toHaveTextContent('(자동)');
  expect(getMarkets).toHaveBeenCalledWith(37.57, 126.99);
});
it.each([false, true])('1km 밖 또는 권한 거부면 목록으로 이동한다 (%s)', async (denied) => {
  locate(denied);
  vi.mocked(getMarkets).mockResolvedValue([{ ...market, distance_m: 1001 }]);
  show();
  expect(await screen.findByRole('heading', { name: '시장 선택' })).toBeInTheDocument();
});
it('오늘 사용자가 선택한 시장을 위치보다 우선한다', async () => {
  show();
  await screen.findByRole('heading', { name: '직접 입력' });
  expect(screen.getByText(/지금 있는 시장 · 시연 시장/)).toBeInTheDocument();
  expect(getMarkets).not.toHaveBeenCalled();
});
it('직접 입력은 가격이 필수이며 결과 진입과 점포 선택 때 제보한다', async () => {
  show();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '대파' } });
  fireEvent.click(await screen.findByRole('button', { name: '대파' }));
  expect(screen.getByRole('button', { name: '확인하기' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('가격 (필수)'), { target: { value: '3000' } });
  fireEvent.click(screen.getByRole('button', { name: '확인하기' }));
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
async function photo(tag: boolean) {
  vi.mocked(recognize).mockResolvedValue({
    vision_labels: ['green onion'],
    candidates: [{ item_id: 'item:green_onion', name: '대파', confidence: 0.94 }],
    media_id: '00000000-0000-4000-8000-000000000001',
    price_tag: tag ? { price: 3000, unit_text: '1단', unit: null, quantity: 1 } : null,
  });
  show('/scan');
  fireEvent.change(screen.getByLabelText('사진 촬영 또는 앨범 선택'), {
    target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: '품목 확인하기' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '결과 보기' })).toBeEnabled());
}
it.each([false, true])('가격표 유무에 따라 확인·제보한다 (%s)', async (tag) => {
  await photo(tag);
  if (tag) expect(screen.getByLabelText('가격 (선택)')).toHaveValue(3000);
  else expect(screen.queryByLabelText('가격 (선택)')).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText('사진 촬영 또는 앨범 선택'), {
    target: { files: [new File(['x'], 'x.jpg')] },
  });
  fireEvent.click(screen.getByRole('button', { name: '품목 확인하기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '사진 인식이 잠시 안 돼요. 이름으로 찾아 주세요',
  );
  expect(screen.getByLabelText('가격 (필수)')).toBeInTheDocument();
});
it('시세 404에서도 확인 포인트와 판매 점포를 보여 준다', async () => {
  vi.mocked(getPrice).mockRejectedValue({ status: 404 });
  show('/items/item:green_onion');
  expect(await screen.findByText('기준시세가 아직 없어요')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '점포 A-05' })).toBeInTheDocument();
});
