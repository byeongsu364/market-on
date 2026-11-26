import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as mock from '../api/mock';
import { buildCardData } from '../utils/decisionCard';
import { planRoute, walkMinutes } from '../utils/shopRoute';
import type { Store } from '../types/contract';

// 지시서 030 5·6단계(찍기, 결과, 품종, 판단 카드, 장보기 동선) 화면 테스트. mock API로 앱 전체를 그림
vi.setConfig({ testTimeout: 20000 });

function show(path: string, state?: object) {
  const [pathname, search = ''] = path.split('?');
  return render(
    <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}`, state }]}>
      <App />
    </MemoryRouter>,
  );
}

it('품종을 바꾸면 결론·눈금·기준시세·차이가 함께 바뀐다(사과 1개 2,300원)', async () => {
  show('/items/item:apple?market=market:demo', { price: 2300, quantity: 1 });
  // 후지: 기준시세 3,200원, 28% 낮음 → 2번 칸
  expect(await screen.findByRole('heading', { name: '살 만한 가격이에요' })).toBeInTheDocument();
  expect(screen.getByText('후지 기준시세보다 28% 낮아요.')).toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: '기준시세와 견준 가격 자리: 살 만함' }),
  ).toBeInTheDocument();
  const table = screen.getByRole('heading', { name: '살 만한 가격이에요' }).closest('section')!;
  // 기준시세 줄(전통시장 평균 줄도 같은 값)
  expect(within(table).getAllByText('3,200원').length).toBeGreaterThan(0);
  expect(within(table).getByText('▼ 28%')).toBeInTheDocument();
  expect(within(table).getByText('900원')).toBeInTheDocument();

  // 홍로: 기준시세 3,500원, 34% 낮음 → 1번 칸
  fireEvent.click(screen.getByRole('button', { name: '홍로' }));
  expect(
    await screen.findByRole('heading', { name: '많이 낮아요, 상태를 꼭 확인하세요' }),
  ).toBeInTheDocument();
  expect(screen.getByText('홍로 기준시세보다 34% 낮아요.')).toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: '기준시세와 견준 가격 자리: 많이 낮음' }),
  ).toBeInTheDocument();
  const hongro = screen.getByRole('heading', { name: '많이 낮아요, 상태를 꼭 확인하세요' });
  expect(within(hongro.closest('section')!).getAllByText('3,500원').length).toBeGreaterThan(0);
  expect(within(hongro.closest('section')!).getByText('▼ 34%')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '사과 홍로' })).toBeInTheDocument();

  // 시나노골드: 기준시세가 없음 → 칸을 모두 끔
  fireEvent.click(screen.getByRole('button', { name: '시나노골드' }));
  expect(await screen.findByRole('heading', { name: '비교는 참고만 하세요' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '기준시세가 없어 비교하지 않아요' })).toBeInTheDocument();
  expect(screen.getByText('시나노골드는 기준시세 자료가 아직 없어요.')).toBeInTheDocument();
  expect(screen.getByText('자료 없음')).toBeInTheDocument();
  expect(screen.queryByText(/▼ \d+%/)).not.toBeInTheDocument();
});

it('품종마다 견주는 목록은 같은 값을 품종별 칸으로 보여 준다', async () => {
  show('/items/item:apple?market=market:demo', { price: 2300, quantity: 1 });
  const list = await screen.findByRole('heading', { name: '2,300원을 품종마다 견주면' });
  const section = list.closest('section')!;
  const rows = within(section).getAllByRole('listitem');
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringMatching(/후지.*3,200원.*살 만함/),
    expect.stringMatching(/홍로.*3,500원.*많이 낮음/),
    expect.stringMatching(/시나노골드.*기준시세 자료 없음.*견줄 수 없음/),
  ]);
});

it('/items/…?variety= 주소만으로 품종과 기준시세를 되살린다', async () => {
  show('/items/item:apple?market=market:demo&variety=variety:apple-hongro');
  expect(await screen.findByRole('heading', { level: 1, name: '사과 홍로' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '홍로' })).toHaveAttribute('aria-pressed', 'true'),
  );
  expect(screen.getByRole('button', { name: '후지' })).toHaveAttribute('aria-pressed', 'false');
  // 가격과 수량은 주소에 없으므로 가격 없이 기준시세만
  expect(
    screen.getByRole('heading', { name: '가격을 넣으면 시세와 견줘 드려요' }),
  ).toBeInTheDocument();
  expect(screen.getAllByText('3,500원').length).toBeGreaterThan(0);
  // 여기서 가격을 넣으면 고른 품종으로 견줌
  fireEvent.click(screen.getByRole('button', { name: '가격 입력하기' }));
  fireEvent.change(screen.getByLabelText('현장 가격'), { target: { value: '2300' } });
  expect(
    await screen.findByRole('heading', { name: '많이 낮아요, 상태를 꼭 확인하세요' }),
  ).toBeInTheDocument();
});

it('품종 견줘 보기는 mock 필드의 설명·수확 시기만 쓰고 없으면 비운다', async () => {
  show('/items/item:apple/varieties?market=market:demo', { price: 2300, quantity: 1 });
  expect(await screen.findByRole('heading', { name: '사과 품종 견줘 보기' })).toBeInTheDocument();
  const fuji = (await screen.findByRole('heading', { name: '후지' })).closest('article')!;
  expect(within(fuji).getByText('10월 하순 이후')).toBeInTheDocument();
  expect(within(fuji).getByRole('img', { name: '수확이 시작되는 달: 10월' })).toBeInTheDocument();
  expect(within(fuji).getByText(/저장성이 좋아요/)).toBeInTheDocument();
  expect(within(fuji).getByText('살 만함')).toBeInTheDocument();
  const gold = screen.getByRole('heading', { name: '시나노골드' }).closest('article')!;
  expect(within(gold).queryByText('수확 시기')).not.toBeInTheDocument();
  expect(within(gold).getByText('기준시세 자료가 아직 없어요')).toBeInTheDocument();
  expect(within(gold).getByText('견줄 수 없음')).toBeInTheDocument();
  expect(within(gold).queryByRole('paragraph')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '후지로 결과 보기' })).toHaveAttribute(
    'href',
    '/items/item%3Aapple?market=market%3Ademo&variety=variety%3Aapple-fuji',
  );
});

it('판단 카드 데이터에 가격 구간과 "신선도는 직접 확인했어요"를 담는다', async () => {
  const item = await mock.getItem('item:apple');
  const price = await mock.price({
    item_id: 'item:apple',
    variety_id: 'variety:apple-hongro',
    market_id: 'market:demo',
    unit: 'each',
    seen_price: 2300,
  });
  const base = {
    item,
    market: { market_id: 'market:demo', name: '시연 시장' },
    checked: [],
    price,
    quantity: 1,
    unit: 'each',
    origin: 'https://example.com',
  };
  const card = buildCardData({ ...base, value: '2300' });
  expect(card.band).toBe(1);
  expect(card.bandLine).toBe('많이 낮아요, 상태를 꼭 확인하세요');
  expect(card.bandLabels).toEqual(['많이 낮음', '살 만함', '조금 높음', '높음']);
  expect(card.footer).toBe('신선도는 직접 확인했어요');
  expect(card.alt).toContain('가격 자리 많이 낮음');
  expect(card.alt).not.toMatch(/판정하지 않아요|사지 마세요/);
  const noPrice = buildCardData({ ...base, value: '' });
  expect(noPrice.band).toBeNull();
  expect(noPrice.bandLine).toBe('');
});

const store = (id: string, sells: string[], lat?: number, lng?: number): Store => ({
  source: 'manual',
  items_basis: 'merchant',
  guessed_item_ids: [],
  price: null,
  store_id: id,
  name: id,
  zone_id: 'z',
  sells,
  map_x: 0,
  map_y: 0,
  hours: '',
  highlight: true,
  lat,
  lng,
});

it('장보기 동선은 가까운 순서로 돌고 한 점포에서 여러 품목을 함께 산다', () => {
  const start = { lat: 37.57, lng: 126.99 };
  const stores = [
    store('far-apple', ['apple'], 37.5709, 126.99),
    store('near-apple', ['apple'], 37.5701, 126.99),
    store('mid-both', ['pear', 'onion'], 37.5704, 126.99),
    store('far-onion', ['onion'], 37.5702, 126.99),
  ];
  const stops = planRoute(stores, ['pear', 'apple', 'onion'], start);
  expect(stops.map((s) => s.store.store_id)).toEqual(['near-apple', 'far-onion', 'mid-both']);
  expect(stops[2].item_ids).toEqual(['pear']);
  expect(stops.every((s) => s.leg_m != null)).toBe(true);
  expect(walkMinutes(stops.map((s) => s.leg_m))).toBeGreaterThan(0);
  // 좌표가 없으면(live) 품목 순서대로 첫 판매 점포, 거리는 모름
  const flat = planRoute(
    stores.map((s) => ({ ...s, lat: undefined, lng: undefined })),
    ['pear', 'apple'],
    start,
  );
  expect(flat.map((s) => s.store.store_id)).toEqual(['mid-both', 'far-apple']);
  expect(walkMinutes(flat.map((s) => s.leg_m))).toBeNull();
});

it('장보기 동선 화면은 순서를 매기고 산 곳을 체크하면 남은 곳이 줄어든다', async () => {
  sessionStorage.clear();
  show('/shop/route?market=market:demo&item=item:apple&item=item:green_onion');
  const boxes = await screen.findAllByRole('checkbox');
  expect(boxes).toHaveLength(2);
  // 1번 입구(예시 좌표)에서 가장 가까운 사과 점포 A-14(약 75m), 거기서 가장 가까운 대파 점포 A-07
  expect(boxes[0]).toHaveAccessibleName(/1번째\s*사과.*점포 A-14/);
  expect(boxes[1]).toHaveAccessibleName(/2번째\s*대파.*점포 A-07/);
  expect(screen.getByText(/남은 2곳, 걸어서 \d+분/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '다음 점포로 길 안내' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&store=store%3AA-14&item=item%3Aapple',
  );
  fireEvent.click(boxes[0]);
  expect(boxes[0]).toBeChecked();
  expect(boxes[0].closest('label')).toHaveAttribute('data-done', 'true');
  expect(screen.getByText(/남은 1곳/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '다음 점포로 길 안내' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&store=store%3AA-07&item=item%3Agreen_onion',
  );
  fireEvent.click(boxes[1]);
  expect(screen.getByText('다 샀어요')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '다음 점포로 길 안내' })).not.toBeInTheDocument();
  // 약도에 순서 번호와 "핀 위치는 예시"
  expect(screen.getByText(/미리보기 지도/)).toBeInTheDocument();
});
