import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as mock from '../api/mock/merchant';
import { saleEnd } from '../utils/sale';
import { getExtras } from '../api/merchant';
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
async function login(id = 'demo_a05') {
  show('/login');
  const credentials = mock.demoCredentials(id);
  fireEvent.change(await screen.findByLabelText('아이디'), {
    target: { value: credentials.login_id },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: credentials.password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}
it('로그인한 상인에게 조회 수와 대기 상인에게 승인 안내를 보여 준다', async () => {
  await login();
  await screen.findByRole('heading', { name: '점포 A-05' });
  expect(await screen.findByText('오늘 내 점포를 본 사람')).toBeInTheDocument();
  expect(screen.getByText('이 세일을 본 사람')).toBeInTheDocument();
  expect(screen.getAllByText('0명')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '로그인' });
  cleanup();
  await login('pending_a08');
  expect(
    await screen.findByRole('heading', { name: '승인을 기다리고 있어요' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/시연 시장 관리자가 확인하면 상인 기능이 열려요/),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '손님으로 계속 쓰기' })).toBeInTheDocument();
});
it('품목·가격·시각을 골라 올리고 소비자에게 보인 뒤 내리면 사라진다', async () => {
  await mock.login(mock.demoCredentials());
  show('/merchant/sale/new');
  fireEvent.click(await screen.findByRole('button', { name: '대파' }));
  fireEvent.change(screen.getByLabelText('할인가'), { target: { value: '2300' } });
  fireEvent.click(screen.getByRole('radio', { name: '2시간 뒤' }));
  expect(screen.getAllByText(/까지 대파 1단 2,300원으로 올릴게요/).length).toBeGreaterThan(0);
  expect(screen.getByText(/올리면 단골 \d+명에게 알림이 가요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '올리기' }));
  await screen.findByRole('heading', { name: '진행 중 세일' });
  expect(await screen.findByText('2,300원')).toBeInTheDocument();
  cleanup();
  show('/s/store:A-05');
  expect(await screen.findByText(/2,300원/)).toBeInTheDocument();
  cleanup();
  show('/merchant');
  fireEvent.click(await screen.findByRole('button', { name: '대파 1단 내리기' }));
  expect(await screen.findByRole('button', { name: '대파 1단 다시 올리기' })).toBeInTheDocument();
  cleanup();
  show('/s/store:A-05');
  await screen.findByText(/2,500원/);
  expect(screen.queryByText(/2,300원/)).not.toBeInTheDocument();
});
it('운영자가 승인하거나 거절하면 대기 목록에서 사라진다', async () => {
  await mock.login(mock.demoCredentials('admin'));
  show('/admin');
  const row = await screen.findByRole('row', { name: /pending_a08/ });
  fireEvent.click(within(row).getByRole('button', { name: /승인/ }));
  expect(await screen.findByText('대기 중인 상인이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /pending_a08/ })).not.toBeInTheDocument();
  await mock.logout();
  await mock.login(mock.demoCredentials('pending_a08'));
  expect((await mock.me()).user?.status).toBe('approved');
});
it('상인 가입은 점포 고르기, 계정, 승인 대기 3단계로 이어진다', async () => {
  show('/signup/merchant');
  expect(await screen.findByRole('img', { name: '3단계 중 1단계' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('간판 이름으로 찾기'), { target: { value: 'A-09' } });
  fireEvent.click(await screen.findByRole('radio', { name: /점포 A-09/ }));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(await screen.findByRole('img', { name: '3단계 중 2단계' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'new_a09' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  expect(
    await screen.findByRole('heading', { name: '승인을 기다리고 있어요' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '3단계 중 3단계' })).toBeInTheDocument();
  expect(screen.getByText('점포 A-09')).toBeInTheDocument();
  expect((await mock.me()).user).toMatchObject({ status: 'pending', role: 'merchant' });
});
it('승인된 상인은 품목별 오늘 품절을 바꾼다(mock)', async () => {
  await mock.login(mock.demoCredentials());
  show('/merchant');
  const toggle = await screen.findByRole('switch', { name: '대파 판매 중' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText('단골 수는 예시 값이에요.')).toBeInTheDocument();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: '대파 판매 중' })).toHaveAttribute(
      'aria-checked',
      'false',
    ),
  );
  expect(screen.getByText('오늘 품절')).toBeInTheDocument();
  expect((await getExtras())?.sold_out_item_ids).toEqual(['item:green_onion']);
});
it('가게 위치 확인에서 핀을 옮겨 저장한다(mock)', async () => {
  await mock.login(mock.demoCredentials());
  const before = (await getExtras())!.location!;
  show('/merchant/store/location');
  const confirm = await screen.findByRole('button', { name: '이 자리가 맞아요' });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '핀 옮기기: 위로' }));
  fireEvent.click(confirm);
  expect(await screen.findByText('가게 위치를 저장했어요.')).toBeInTheDocument();
  expect(await screen.findByText('확인함')).toBeInTheDocument();
  const after = (await getExtras())!;
  expect(after.location_confirmed).toBe(true);
  expect(after.location!.lat).toBeGreaterThan(before.lat);
});
it('포스터는 공개 점포 URL로 QR SVG를 만든다', async () => {
  await mock.login(mock.demoCredentials());
  const { container } = show('/merchant/poster');
  expect(await screen.findByText(/\/s\/store:A-05/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelector('.poster-qr svg')).toBeTruthy());
  expect(screen.getByRole('button', { name: '인쇄하기' })).toBeInTheDocument();
});
it('공개 점포 방문과 보이는 세일만 조회하며 같은 날 중복을 막는다', async () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  const initial = mock.sales[0].view_count;
  show('/s/store:A-05');
  await screen.findByText('2,500원');
  expect(mock.sales[0].view_count).toBe(initial);
  callbacks.forEach((cb) =>
    cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  await waitFor(() => expect(mock.sales[0].view_count).toBe(initial + 1));
  callbacks.forEach((cb) =>
    cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(mock.sales[0].view_count).toBe(initial + 1);
  await mock.login(mock.demoCredentials());
  expect((await mock.getStore()).today_views).toBe(1);
  vi.unstubAllGlobals();
});
it('새 비밀번호로 가입·재로그인하고 승인 전 편집을 막는다', async () => {
  const q = { ...mock.demoCredentials('new_merchant'), store_id: 'store:A-09' };
  expect((await mock.signup(q)).user?.status).toBe('pending');
  await mock.logout();
  await mock.login(q);
  await expect(
    mock.createSale({ item_id: 'item:apple', sale_price: 2000, ends_at: saleEnd() }),
  ).rejects.toThrow();
});
it('게시 문구에 과장 표현이 없다', async () => {
  const files = import.meta.glob('../{pages,components,i18n/locales}/**/*.{tsx,json}', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  expect(Object.values(files).join(' ')).not.toMatch(
    new RegExp(['특' + '가', '강력 ' + '추천', '놓치지 ' + '마세요'].join('|')),
  );
});
it('PC 상인 홈은 역할 머리말, 가격 표, 오른쪽 마감세일 면을 보여 준다', async () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  await mock.login(mock.demoCredentials());
  show('/merchant');
  expect(await screen.findByRole('heading', { name: '점포 A-05' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'QR 포스터' })).toBeInTheDocument();
  const aside = await screen.findByRole('form', { name: '마감세일 올리기' });
  fireEvent.click(await within(aside).findByRole('button', { name: '양파' }));
  fireEvent.change(within(aside).getByLabelText('할인가'), { target: { value: '1800' } });
  fireEvent.click(within(aside).getByRole('button', { name: '올리기' }));
  expect(await screen.findByRole('row', { name: /양파 1kg 1,800원/ })).toBeInTheDocument();
  cleanup();
});
