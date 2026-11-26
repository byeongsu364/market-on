import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import MiniMap from '../components/domain/MiniMap';
import MapView from '../components/map/MapView';
import { directionUrls, formatDistance, storeDestination, walkMinutes } from '../utils/directions';
import { parseSearch } from '../pages/map/helpers';
import * as api from '../api/markets';
import * as storesApi from '../api/stores';
import * as mock from '../api/mock';
import { loadNaverMap, type NaverMaps } from '../utils/naverMap';
import type { Market, Store } from '../types/contract';
const market: Market = {
  market_id: 'market:demo',
  name: '시연 시장 & 사과',
  status: 'active',
  lat: 37.57,
  lng: 126.99,
  distance_m: 500,
};
beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.naver;
});
function Location() {
  const location = useLocation();
  return <output aria-label="주소">{location.pathname + location.search}</output>;
}
function show(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}
const here = () => screen.getByLabelText('주소');
function locate(position: { lat: number; lng: number } | null) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        position
          ? ok({
              coords: { latitude: position.lat, longitude: position.lng },
            } as GeolocationPosition)
          : fail({ code: 1 } as GeolocationPositionError),
    },
  });
}
const pinButtons = () => screen.queryAllByRole('button', { name: /^점포 A-\d\d, / });

it('시장 밖 `/`은 지도 키 없이 약도로 보이고, 위치를 쓰면 가까운 시장 카드와 길 안내를 보인다', async () => {
  locate({ lat: 37.5702, lng: 126.9902 });
  const { container } = show('/');
  expect(
    await screen.findByRole('heading', { name: '가까운 시장부터 보여 드릴까요?' }),
  ).toBeInTheDocument();
  expect(container.querySelector('[data-map="sketch"]')).toBeTruthy();
  expect(screen.getByText('미리보기 지도')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '시장 직접 고르기' })).toHaveAttribute(
    'href',
    '/markets',
  );
  fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용하기' }));
  expect(await screen.findByRole('heading', { name: '시연 시장' })).toBeInTheDocument();
  expect(screen.getByText(/식품 점포 24곳이 있어요/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '둘러보기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
  // 지도 위 시장 이름표: 준비 중 시장은 이름에 "준비 중"
  expect(screen.getByRole('button', { name: '미지원 시장 · 샘플, 준비 중' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '길 안내' }));
  const dialog = screen.getByRole('dialog', { name: '시연 시장까지 안내할게요' });
  expect(within(dialog).getByRole('link', { name: '네이버 지도로 길 안내' })).toHaveAttribute(
    'href',
    directionUrls({ name: '시연 시장', lat: 37.57, lng: 126.99 }, window.location.origin).naverWeb,
  );
});

it('위치를 거부하면 시장 목록으로 안내한다', async () => {
  localStorage.setItem('map-onboarded', '1');
  locate(null);
  show('/');
  expect(
    await screen.findByRole('heading', { name: '위치를 확인하지 못했어요' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '시장 목록으로 보기' })).toHaveAttribute(
    'href',
    '/markets',
  );
});

it('`/?market=market:demo`는 약도에 경계·핀·편의시설과 점포 목록 시트를 보인다', async () => {
  const { container } = show('/?market=market:demo');
  expect(await screen.findByRole('tab', { name: '점포 24' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(container.querySelector('[data-map="sketch"]')).toBeTruthy();
  expect(screen.getByText('핀 위치는 예시')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '공중화장실' })).toBeInTheDocument();
  expect(pinButtons()).toHaveLength(24);
  const list = screen.getByRole('list', { name: '점포' });
  expect(within(list).getAllByRole('link')).toHaveLength(10);
  expect(within(list).getAllByRole('link')[0].getAttribute('href')).toMatch(
    /^\/s\/store%3AA-\d\d\?market=market%3Ademo$/,
  );
  fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
  expect(within(list).getAllByRole('link')).toHaveLength(24);
  // 카테고리로 거르면 나머지 핀은 회색 점
  fireEvent.click(screen.getByRole('button', { name: '수산 4' }));
  expect(within(list).getAllByRole('link')).toHaveLength(4);
  expect(pinButtons()).toHaveLength(4);
  expect(container.querySelectorAll('.mo-dot')).toHaveLength(20);
  fireEvent.click(screen.getByRole('tab', { name: '제철과 시세' }));
  expect(here()).toHaveTextContent('tab=info');
  expect(await screen.findByRole('heading', { name: '오늘 기준시세' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '마감세일 1' }));
  expect(await screen.findByRole('heading', { name: '지금 마감세일' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /점포 A-05/ })).toHaveAttribute(
    'href',
    '/s/store%3AA-05?market=market%3Ademo',
  );
});

it('`/?market=&item=`은 파는 점포만 핀으로 남기고 나머지는 점으로 줄인다', async () => {
  const spy = vi.spyOn(storesApi, 'getMarketMap');
  const marketsSpy = vi.spyOn(api, 'getMarkets');
  const marketSpy = vi.spyOn(api, 'getMarket');
  const { container } = show('/?market=market:demo&item=item:green_onion');
  expect(await screen.findByRole('heading', { name: '대파 파는 점포' })).toBeInTheDocument();
  expect(spy).toHaveBeenCalledWith('market:demo', 'item:green_onion', undefined);
  expect(await screen.findByText('3곳')).toBeInTheDocument();
  expect(pinButtons()).toHaveLength(3);
  expect(container.querySelectorAll('.mo-dot')).toHaveLength(21);
  expect(marketsSpy).not.toHaveBeenCalled();
  expect(marketSpy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(
    within(screen.getByRole('list', { name: '대파 파는 점포' })).getAllByRole('button'),
  ).toHaveLength(3);
  // 검색어 지우기는 시장 안으로
  expect(screen.getByRole('link', { name: '검색어 지우기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
});

it('`/?market=market:demo&item=item:apple`은 약도로 보이고 품종으로 거른다', async () => {
  const { container } = show('/?market=market:demo&item=item:apple');
  expect(await screen.findByRole('heading', { name: '사과 파는 점포' })).toBeInTheDocument();
  expect(container.querySelector('[data-map="sketch"]')).toBeTruthy();
  await waitFor(() => expect(pinButtons()).toHaveLength(5));
  fireEvent.click(await screen.findByRole('button', { name: '홍로' }));
  expect(here()).toHaveTextContent('variety=variety%3Aapple-hongro');
  await waitFor(() => expect(pinButtons()).toHaveLength(2));
  expect(screen.getByRole('button', { name: '홍로' })).toHaveAttribute('aria-pressed', 'true');
});

it('주소만으로 시장·품목·점포가 복원된다', async () => {
  show('/?market=market:demo&item=item:apple&store=store:A-02');
  expect(await screen.findByRole('region', { name: '고른 점포 점포 A-02' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '점포 A-02, 채소·과일 점포, 선택됨' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /사과/ })).toHaveAttribute(
    'href',
    '/search?market=market%3Ademo&q=%EC%82%AC%EA%B3%BC',
  );
  expect(screen.getByRole('link', { name: '점포 보기' })).toHaveAttribute(
    'href',
    '/s/store%3AA-02?market=market%3Ademo&item=item%3Aapple',
  );
});

it('키보드로 지도 홈에서 검색, 점포, 길 안내까지 간다', async () => {
  show('/?market=market:demo');
  const search = await screen.findByRole('link', { name: '시연 시장에서 품목 검색' });
  search.focus();
  expect(search).toHaveFocus();
  fireEvent.click(search);
  const input = await screen.findByLabelText('시연 시장에서 품목 검색');
  expect(input.tagName).toBe('INPUT');
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: '대파' } });
  await screen.findByRole('link', { name: /대파/ });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() =>
    expect(here()).toHaveTextContent('/?market=market%3Ademo&item=item%3Agreen_onion'),
  );
  const list = await screen.findByRole('list', { name: '대파 파는 점포' });
  const row = within(list).getByRole('button', { name: /점포 A-05/ });
  row.focus();
  expect(row).toHaveFocus();
  fireEvent.click(row);
  expect(here()).toHaveTextContent('store=store%3AA-05');
  const card = screen.getByRole('region', { name: '고른 점포 점포 A-05' });
  fireEvent.click(within(card).getByRole('link', { name: '점포 보기' }));
  expect(await screen.findByRole('heading', { name: '점포 A-05', level: 1 })).toBeInTheDocument();
  const route = screen.getByRole('button', { name: '길 안내' });
  route.focus();
  expect(route).toHaveFocus();
  await waitFor(() => expect(route).toBeEnabled());
  fireEvent.click(route);
  const dialog = screen.getByRole('dialog', { name: '점포 A-05까지 안내할게요' });
  const naver = within(dialog).getByRole('link', { name: '네이버 지도로 길 안내' });
  expect(naver.getAttribute('href')).toBe(
    'https://map.naver.com/p/search/' + encodeURIComponent('시연 시장 점포 A-05'),
  );
  const kakao = within(dialog).getByRole('link', { name: '카카오맵으로 열기' });
  expect(kakao.getAttribute('href')).toMatch(/^https:\/\/map\.kakao\.com\/link\/to\//);
  expect(kakao.getAttribute('href')).not.toMatch(/37\.5700?,126\.990?$/);
  expect(
    within(dialog).getByText('지도 앱에는 목적지만 넘기고 내 위치는 넘기지 않아요.'),
  ).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(route).toHaveFocus();
});

it('검색에 가격을 넣으면 결과로, 모르는 품목이면 찾을 수 있는 품목을 보인다', async () => {
  expect(parseSearch('사과 2,300원')).toEqual({ name: '사과', price: 2300 });
  expect(parseSearch('대파')).toEqual({ name: '대파', price: null });
  expect(parseSearch('사과 5')).toEqual({ name: '사과', price: null });
  show('/search?market=market:demo&q=사과 2300');
  const row = await screen.findByRole('link', { name: /사과 2,300원/ });
  expect(row).toHaveAttribute('href', '/items/item%3Aapple?market=market%3Ademo');
  fireEvent.change(screen.getByLabelText('시연 시장에서 품목 검색'), {
    target: { value: '고등어' },
  });
  expect(
    await screen.findByRole('heading', { name: '고등어 파는 점포는 아직 몰라요' }),
  ).toBeInTheDocument();
  expect(screen.getByText('지금은 품목 5가지만 파는 점포를 찾을 수 있어요.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '시연 시장 점포 지도에서 보기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
  expect(screen.getByRole('link', { name: '단감' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&item=item%3Asweet_persimmon',
  );
  fireEvent.click(screen.getByRole('link', { name: '단감' }));
  expect(here()).toHaveTextContent('item=item%3Asweet_persimmon');
});

it('시장 고르기에서 지원 시장을 고르면 그 시장 안 지도로 간다', async () => {
  show('/markets');
  fireEvent.click(await screen.findByRole('button', { name: /시연 시장/ }));
  await waitFor(() => expect(here()).toHaveTextContent('/?market=market%3Ademo'));
});

it('준비 중 시장은 요청 화면과 지금 쓸 수 있는 시장을 보인다', async () => {
  show('/?market=market:std-sample');
  expect(await screen.findByRole('heading', { name: /아직 준비 중이에요/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '이 시장도 쓰고 싶어요' }));
  expect(await screen.findByText('요청했어요. 이번 주 5명 미만이 요청했어요.')).toHaveAttribute(
    'role',
    'status',
  );
  expect(screen.getByRole('link', { name: /시연 시장은 지금 쓸 수 있어요/ })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo',
  );
});

it('점포에 좌표가 없으면(live) 실제 지도에 업종별 예시 핀을 찍고 길 안내는 시장 위치로 한다', async () => {
  vi.spyOn(storesApi, 'getMarketMap').mockImplementation(async (id, item, unit) => {
    const map = await mock.map(id, item, unit);
    return {
      ...map,
      boundary: undefined,
      facilities: undefined,
      stores: map.stores.map((s) => {
        const copy: Store = { ...s };
        delete copy.lat;
        delete copy.lng;
        return copy;
      }),
    };
  });
  const { container } = show('/?market=market:demo&item=item:green_onion');
  // 평면도 대신 지도(테스트는 약도)에 핀을 찍고 "핀 위치는 예시"를 표시
  expect(await screen.findByText('핀 위치는 예시')).toBeInTheDocument();
  expect(container.querySelector('[data-map]')).not.toBeNull();
  expect(
    screen.queryByText('배치는 업종별 예시예요 · 실제 위치는 현장에서 확인해 주세요'),
  ).toBeNull();
  const pinsOnMap = container.querySelectorAll('[data-map] button');
  expect(pinsOnMap.length).toBeGreaterThanOrEqual(3);
  fireEvent.click(
    within(container.querySelector('[data-map]') as HTMLElement).getAllByRole('button', {
      name: /점포 A-05/,
    })[0],
  );
  const card = await screen.findByRole('region', { name: '고른 점포 점포 A-05' });
  fireEvent.click(within(card).getByRole('button', { name: '길 안내' }));
  const dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByText(/점포 위치가 아직 없어 시장 위치로 안내해요/),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: '카카오맵으로 열기' })).toHaveAttribute(
    'href',
    'https://map.kakao.com/link/to/' + encodeURIComponent('시연 시장 점포 A-05') + ',37.57,126.99',
  );
});

it('강조 점포가 가장 많은 구역의 줄부터 보여 주되 평면도 폭은 줄이지 않는다', async () => {
  const map = await mock.map('market:demo', 'item:green_onion');
  const target = map.zones[3];
  map.stores.slice(0, 5).forEach((s) => {
    s.highlight = true;
    s.zone_id = target.id;
  });
  const { container } = render(<MiniMap map={map} itemName="대파" />);
  expect(container.querySelector('svg')).toHaveAttribute('data-focused-zone', target.id);
  const [x, y, w] = (container.querySelector('svg')?.getAttribute('viewBox') ?? '')
    .split(' ')
    .map(Number);
  expect([x, w]).toEqual([0, 376]);
  expect(y).toBe(Math.max(0, target.y - 8));
  expect(screen.getByText('대파 5곳')).toBeInTheDocument();
  // 평면도 칸은 Tab 순서에서 빠짐(아래 목록이 같은 점포 버튼)
  const clickable = render(<MiniMap map={map} onStore={() => {}} />);
  expect(within(clickable.container).getAllByRole('button')[0]).toHaveAttribute('tabindex', '-1');
});

it('길 안내는 목적지 이름을 인코딩하고 출발 위치를 받지 않는다', () => {
  const urls = directionUrls(market, 'https://example.com');
  expect(urls.naverApp).toBe(
    'nmap://route/public?dlat=37.57&dlng=126.99&dname=' +
      encodeURIComponent(market.name) +
      '&appname=https%3A%2F%2Fexample.com',
  );
  expect(urls.naverWeb).toBe('https://map.naver.com/p/search/' + encodeURIComponent(market.name));
  expect(urls.kakao).toBe(
    'https://map.kakao.com/link/to/' + encodeURIComponent(market.name) + ',37.57,126.99',
  );
  expect(JSON.stringify(urls)).not.toMatch(/slat|slng|sname/);
  expect(formatDistance(999)).toBe('999m');
  expect(formatDistance(1000)).toBe('1.0km');
  expect(walkMinutes(420)).toBe(6);
  // 점포: 네이버에서 열 이름이 있으면 그 이름, 좌표가 없으면 시장 좌표로 대신
  expect(storeDestination({ name: '점포 A-01', naver_name: '사과가게' }, market)).toEqual({
    name: '사과가게',
    lat: 37.57,
    lng: 126.99,
    approximate: true,
  });
  expect(
    storeDestination({ name: '점포 A-01', lat: 37.5701, lng: 126.9902 }, market),
  ).toMatchObject({ name: '시연 시장 & 사과 점포 A-01', lat: 37.5701, approximate: false });
});

it('SDK 스크립트를 한 번만 로드하고 실패하면 mock에서는 약도로 그린다', async () => {
  vi.spyOn(api, 'getPublicConfig').mockResolvedValue({ naver_map_client_id: 'test id' });
  const pending = loadNaverMap('test id');
  expect(loadNaverMap('test id')).toBe(pending);
  const script = document.querySelector<HTMLScriptElement>('#naver-maps-sdk')!;
  expect(script.src).toContain('ncpKeyId=test%20id');
  const error = expect(pending).rejects.toThrow();
  script.dispatchEvent(new Event('error'));
  await error;
  const onFailure = vi.fn();
  const { container } = render(
    <MapView
      label="지도"
      markets={[{ ...market, id: market.market_id, active: true }]}
      onFailure={onFailure}
    />,
  );
  await waitFor(() => expect(container.querySelector('[data-map="sketch"]')).toBeTruthy());
  expect(onFailure).not.toHaveBeenCalled();
  expect(document.querySelectorAll('#naver-maps-sdk')).toHaveLength(1);
});

it('모킹한 네이버 지도 마커 클릭은 시장을 고르고 정리된다', async () => {
  const click = vi.fn();
  const destroy = vi.fn();
  const remove = vi.fn();
  const setMap = vi.fn();
  let select = () => {};
  window.naver = {
    maps: {
      Map: vi.fn(function () {
        return { destroy, fitBounds: vi.fn() };
      }),
      LatLng: vi.fn(function () {
        return {};
      }),
      LatLngBounds: vi.fn(function () {
        return { extend: vi.fn() };
      }),
      Marker: vi.fn(function () {
        return { setMap };
      }),
      Event: {
        addListener: vi.fn((_target, _name, callback) => {
          select = callback;
          return {};
        }),
        removeListener: remove,
      },
    } as NaverMaps,
  };
  vi.spyOn(api, 'getPublicConfig').mockResolvedValue({ naver_map_client_id: 'test' });
  const { unmount, container } = render(
    <MapView
      label="주변 시장 지도"
      markets={[{ ...market, id: market.market_id, active: true }]}
      me={{ lat: 37, lng: 127 }}
      onSelect={click}
    />,
  );
  await waitFor(() => expect(window.naver?.maps.Marker).toHaveBeenCalled());
  expect(container.querySelector('[data-map="naver"]')).toBeTruthy();
  select();
  expect(click).toHaveBeenCalledWith('market:demo', 'market');
  unmount();
  expect(destroy).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
  expect(setMap).toHaveBeenCalledWith(null);
});

it('추가 공개 API mock의 계약 키와 판매 점포 수가 일치한다', async () => {
  expect(await api.getPublicConfig()).toEqual({ naver_map_client_id: null });
  const items = await api.getMarketItems('market:demo');
  expect(Object.keys(items[0]).sort()).toEqual(['item_id', 'name', 'store_count']);
  expect(items.find((item) => item.item_id === 'item:green_onion')?.store_count).toBe(3);
  expect(items.every((item) => item.store_count > 0)).toBe(true);
  expect(items.map((item) => item.name)).toEqual(
    items.map((item) => item.name).sort((a, b) => a.localeCompare(b, 'ko')),
  );
});

it('네이버 인증 실패(등록 안 된 주소)를 알린다', async () => {
  const { onNaverAuthFailure } = await import('../utils/naverMap');
  const seen = vi.fn();
  const off = onNaverAuthFailure(seen);
  window.navermap_authFailure?.();
  expect(seen).toHaveBeenCalled();
  off();
});
