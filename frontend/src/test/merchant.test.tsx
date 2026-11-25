import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as mock from '../api/mock/merchant';
import { saleEnd } from '../utils/sale';
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
async function login(id = 'demo_a05') {
  show('/merchant/login');
  const credentials = mock.demoCredentials(id);
  fireEvent.change(await screen.findByLabelText('아이디'), {
    target: { value: credentials.login_id },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: credentials.password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}
it('로그인한 상인에게 숫자 두 개와 대기 상인에게 승인 안내를 보여 준다', async () => {
  await login();
  await screen.findByRole('heading', { name: '점포 A-05' });
  expect(await screen.findByText('오늘 내 점포를 본 사람')).toBeInTheDocument();
  expect(screen.getByText('이 세일을 본 사람')).toBeInTheDocument();
  expect(screen.getAllByText('0명')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await screen.findByRole('heading', { name: '상인이신가요?' });
  cleanup();
  await login('pending_a08');
  expect(await screen.findByRole('heading', { name: '승인 대기 중이에요' })).toBeInTheDocument();
  expect(screen.getByText('시장 관리자가 확인하면 열려요')).toBeInTheDocument();
});
it('품목·가격·시각을 골라 올리고 소비자에게 보인 뒤 내리면 사라진다', async () => {
  await mock.login(mock.demoCredentials());
  show('/merchant/sale/new');
  fireEvent.click(await screen.findByRole('button', { name: '대파' }));
  fireEvent.change(screen.getByLabelText('할인가'), { target: { value: '2300' } });
  fireEvent.click(screen.getByRole('button', { name: '2시간 뒤' }));
  expect(screen.getByText(/까지 대파 2,300원으로 올릴게요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '올리기' }));
  await screen.findByRole('heading', { name: '진행 중 세일' });
  expect(await screen.findByText(/2,300원/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '홈' }));
  expect(await screen.findByText('2,300원')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '상인' }));
  const price = await screen.findByText(/2,300원/);
  const card = price.closest('article')!;
  fireEvent.click(within(card).getByRole('button', { name: '내리기' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '다시 올리기' })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('link', { name: '홈' }));
  await screen.findByRole('heading', { name: '지금 마감세일' });
  expect(screen.queryByText('2,300원')).not.toBeInTheDocument();
});
it('운영자가 승인하거나 거절하면 대기 목록에서 사라진다', async () => {
  await mock.login(mock.demoCredentials('admin'));
  show('/admin');
  const title = await screen.findByRole('heading', { name: 'pending_a08' });
  fireEvent.click(within(title.closest('article')!).getByRole('button', { name: '승인' }));
  expect(await screen.findByText('대기 중인 상인이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'pending_a08' })).not.toBeInTheDocument();
  await mock.logout();
  await mock.login(mock.demoCredentials('pending_a08'));
  expect((await mock.me()).user?.status).toBe('approved');
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
