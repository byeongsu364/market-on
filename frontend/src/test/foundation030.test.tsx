import { it, expect, describe } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { bandOf, priceBand } from '../utils/priceBand';
import { categoryOfZone } from '../utils/category';
import { itemImage } from '../utils/itemImage';
import { shoppingHref } from '../hooks/useShoppingContext';
import { PriceGauge, MiniGauge, Field, Toggle } from '../components/common/parts';
import Button, { ButtonLink } from '../components/common/Button';
import { getPrice } from '../api/price';
import SketchMap from '../components/map/SketchMap';

describe('가격 구간(지시서 030)', () => {
  it('경계값을 규칙대로 나눈다', () => {
    expect(bandOf(-31)).toBe(1);
    expect(bandOf(-30)).toBe(2);
    expect(bandOf(5)).toBe(2);
    expect(bandOf(6)).toBe(3);
    expect(bandOf(20)).toBe(3);
    expect(bandOf(21)).toBe(4);
    expect(bandOf(null)).toBeNull();
  });
  it('사과 1개 2,300원: 후지 2번 칸, 홍로 1번 칸, 시나노골드는 모두 끔', async () => {
    const q = { item_id: 'item:apple', market_id: 'market:demo', unit: 'each', seen_price: 2300 };
    const fuji = await getPrice({ ...q, variety_id: 'variety:apple-fuji' });
    expect(fuji.diff_pct).toBe(-28);
    expect(priceBand(fuji).band).toBe(2);
    expect(priceBand(fuji).message).toBe('기준시세보다 28% 낮아요');
    const hongro = await getPrice({ ...q, variety_id: 'variety:apple-hongro' });
    expect(hongro.diff_pct).toBe(-34);
    expect(priceBand(hongro).band).toBe(1);
    const gold = await getPrice({ ...q, variety_id: 'variety:apple-shinano-gold' });
    expect(priceBand(gold).band).toBeNull();
    expect(priceBand(gold).message).toBe('비교는 참고만 하세요');
  });
  it('대체값이면 칸을 끄고 무엇으로 대신했는지 적는다', async () => {
    const p = await getPrice({ item_id: 'item:onion', market_id: 'market:demo', unit: 'kg' });
    const v = priceBand({ ...p, fallback: 'region_avg', diff_pct: -10 });
    expect(v.band).toBeNull();
    expect(v.fallbackNote).toBe('같은 지역 평균으로 대신했어요');
  });
});

it('구역 이름으로 카테고리를, 품목·품종 id로 그림을 고른다', () => {
  expect(categoryOfZone('청과')).toBe('produce');
  expect(categoryOfZone('건어물·젓갈')).toBe('dried');
  expect(categoryOfZone('떡·분식')).toBe('ricecake');
  expect(categoryOfZone('잡화')).toBeNull();
  expect(itemImage('item:sweet_persimmon')).toBe('/items/persimmon.svg');
  expect(itemImage('item:apple', 'variety:apple-hongro')).toBe('/items/apple-hongro.svg');
  expect(itemImage('item:garlic')).toBeNull();
});

it('장보기 맥락은 주소 쿼리로 넘기고 null은 지운다', () => {
  expect(
    shoppingHref(
      '/',
      { market: 'market:demo', item: 'item:apple', store: null },
      new URLSearchParams('store=x'),
    ),
  ).toBe('/?store=x'.replace('store=x', 'market=market%3Ademo&item=item%3Aapple'));
});

it('가격 눈금은 한 칸만 켜고 기준시세가 없으면 모두 끈다', () => {
  const { container, rerender } = render(<PriceGauge band={2} />);
  expect(
    screen.getByRole('img', { name: '기준시세와 비교한 가격 자리: 낮음' }),
  ).toBeInTheDocument();
  expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(1);
  rerender(<PriceGauge band={null} />);
  expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(0);
  rerender(<MiniGauge band={4} />);
  expect(screen.getByRole('img', { name: '가격 자리: 높음' })).toBeInTheDocument();
});

it('공용 부품은 실제 button·a·input+label을 쓴다', () => {
  render(
    <MemoryRouter>
      <Button variant="primary">길 안내</Button>
      <ButtonLink to="/scan">찍기</ButtonLink>
      <Field label="현장 가격" suffix="원" inputMode="numeric" error="숫자로 넣어 주세요" />
      <Toggle label="알림 받기" checked={false} onChange={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: '길 안내' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '찍기' })).toHaveAttribute('href', '/scan');
  expect(screen.getByLabelText('현장 가격')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('switch', { name: '알림 받기' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

it('약도는 핀·편의시설·내 위치를 그리고 "미리보기 지도"를 적는다', () => {
  render(
    <SketchMap
      label="시연 시장 지도"
      sample
      boundary={[
        { lat: 37.571, lng: 126.989 },
        { lat: 37.571, lng: 126.991 },
        { lat: 37.569, lng: 126.991 },
      ]}
      facilities={[{ kind: 'toilet', name: '공중화장실', lat: 37.5701, lng: 126.9901 }]}
      pins={[
        {
          id: 'a',
          name: '점포 A-01',
          lat: 37.5702,
          lng: 126.9902,
          category: 'produce',
          sale: true,
        },
        { id: 'b', name: '점포 A-02', lat: 37.5703, lng: 126.9903, category: 'meat', state: 'dim' },
      ]}
      me={{ lat: 37.5699, lng: 126.9899 }}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByText('미리보기 지도')).toBeInTheDocument();
  expect(screen.getByText('핀 위치는 예시')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '점포 A-01, 채소·과일 점포, 마감세일 중' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /점포 A-02/ })).toBeNull();
  expect(screen.getByRole('img', { name: '공중화장실' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '내 위치' })).toBeInTheDocument();
});
