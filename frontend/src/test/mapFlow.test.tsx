import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import MiniMap from '../components/domain/MiniMap';
import NearbyMap from '../components/domain/NearbyMap';
import { mapMode } from '../hooks/useNearbyMarkets';
import { directionUrls, formatDistance } from '../utils/directions';
import * as api from '../api/markets';
import * as storesApi from '../api/stores';
import * as mock from '../api/mock';
import { loadNaverMap, type NaverMaps } from '../utils/naverMap';
import type { Market } from '../types/contract';
const market: Market = {
  market_id: 'market:demo',
  name: '시연 시장 & 사과',
  status: 'active',
  lat: 37.57,
  lng: 126.99,
  distance_m: 500,
};
afterEach(() => {
  vi.restoreAllMocks();
  delete window.naver;
});
function Location() {
  const location = useLocation();
  return <output aria-label="주소">{location.search}</output>;
}
function show(path = '/map') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}
it('모드: 가장 가까운 active가 1km 안이고 선택됐을 때만 안, 품목 링크는 안', () => {
  expect(mapMode(undefined, market, [market])).toBe('inside');
  expect(mapMode(undefined, market, [{ ...market, distance_m: 1000 }])).toBe('inside');
  expect(mapMode(undefined, market, [{ ...market, distance_m: 1001 }])).toBe('outside');
  expect(mapMode(undefined, market, [{ ...market, status: 'listed' }])).toBe('outside');
  expect(mapMode(undefined, market, [{ ...market, distance_m: null }])).toBe('outside');
  expect(mapMode(undefined, null, [market])).toBe('outside');
  expect(
    mapMode(undefined, market, [{ ...market, market_id: 'other', distance_m: 100 }, market]),
  ).toBe('outside');
  expect(mapMode('item:apple', null, [])).toBe('inside');
});
it('품목 칩이 URL과 강조 요청을 갱신하고 전체를 누르면 지운다', async () => {
  const spy = vi.spyOn(storesApi, 'getMarketMap');
  const { container } = show('/map?item=item:apple');
  const chip = await screen.findByRole('button', { name: '대파 3곳' });
  fireEvent.click(chip);
  expect(screen.getByLabelText('주소')).toHaveTextContent('item=item%3Agreen_onion');
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith('market:demo', 'item:green_onion', undefined),
  );
  await screen.findByText('대파 파는 점포 3곳');
  expect(container.querySelectorAll('[data-highlight="true"]')).toHaveLength(3);
  expect(container.querySelector('[data-focused-zone]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '전체' }));
  expect(screen.getByLabelText('주소')).toHaveTextContent('');
});
it('강조 점포가 가장 많은 구역으로 viewBox를 맞추고 구역별 개수를 표시한다', async () => {
  const map = await mock.map('market:demo', 'item:green_onion');
  const target = map.zones[3];
  map.stores.slice(0, 5).forEach((s) => {
    s.highlight = true;
    s.zone_id = target.id;
  });
  const { container } = render(<MiniMap map={map} itemName="대파" />);
  expect(container.querySelector('svg')).toHaveAttribute('data-focused-zone', target.id);
  expect(container.querySelector('svg')?.getAttribute('viewBox')).not.toMatch(/^0 0 376/);
  expect(screen.getByText('대파 5곳')).toBeInTheDocument();
});
it('위치 거부와 키 null은 active/listed 시장 카드 목록으로 대체한다', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    },
  });
  vi.spyOn(api, 'getMarkets').mockResolvedValue([
    market,
    { ...market, market_id: 'listed', name: '준비 시장', status: 'listed', distance_m: 1500 },
  ]);
  vi.spyOn(api, 'getPublicConfig').mockResolvedValue({ naver_map_client_id: null });
  show();
  expect(await screen.findByText('주변 시장을 목록으로 보여드려요')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '주변 시장' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText(/품목 5종/)).toBeInTheDocument();
  expect(screen.getByText('500m')).toBeInTheDocument();
  expect(screen.getByText('1.5km')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이 시장도 쓰고 싶어요' })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: '길 안내' })[0]);
  expect(screen.getByRole('link', { name: '네이버지도' })).toHaveAttribute(
    'href',
    directionUrls(market, window.location.origin).naverWeb,
  );
  expect(screen.getByRole('link', { name: '카카오맵' })).toHaveAttribute(
    'href',
    directionUrls(market, window.location.origin).kakao,
  );
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  fireEvent.click(screen.getByRole('button', { name: '이 시장 둘러보기' }));
  expect(screen.getByRole('button', { name: '시장 안 지도' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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
});
it('SDK 스크립트를 한 번만 로드하고 실패하면 목록 대체 안내를 표시한다', async () => {
  vi.spyOn(api, 'getPublicConfig').mockResolvedValue({ naver_map_client_id: 'test id' });
  const pending = loadNaverMap('test id');
  expect(loadNaverMap('test id')).toBe(pending);
  const script = document.querySelector<HTMLScriptElement>('#naver-maps-sdk')!;
  expect(script.src).toContain('ncpKeyId=test%20id');
  const error = expect(pending).rejects.toThrow();
  script.dispatchEvent(new Event('error'));
  await error;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  render(<NearbyMap markets={[market]} position={null} onSelect={vi.fn()} />);
  expect(await screen.findByText('주변 시장을 목록으로 보여드려요')).toBeInTheDocument();
  expect(document.querySelectorAll('#naver-maps-sdk')).toHaveLength(1);
});
it('모킹한 네이버 지도 마커 클릭은 시장을 선택하고 정리된다', async () => {
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
  const { unmount } = render(
    <NearbyMap markets={[market]} position={{ lat: 37, lng: 127 }} onSelect={click} />,
  );
  await waitFor(() => expect(window.naver?.maps.Marker).toHaveBeenCalled());
  select();
  expect(click).toHaveBeenCalledWith(market);
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

it('네이버 인증 실패(등록 안 된 주소)면 시장 목록으로 바꾼다', async () => {
  const { onNaverAuthFailure } = await import('../utils/naverMap');
  const seen = vi.fn();
  const off = onNaverAuthFailure(seen);
  window.navermap_authFailure?.();
  expect(seen).toHaveBeenCalled();
  off();
});
