import { it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
it('결과의 실제 체크박스와 가격 비교를 표시하고 판정 표현을 사용하지 않는다', async () => {
  const { container } = show('/items/item:green_onion');
  await screen.findByRole('heading', { name: '대파' });
  const checkbox = screen.getAllByRole('checkbox')[0];
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  fireEvent.change(screen.getByLabelText('현장 가격'), { target: { value: '3500' } });
  expect(await screen.findByText('▲ 70%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('현장 가격'), { target: { value: '1800' } });
  expect(await screen.findByText('▼ 13%')).toBeInTheDocument();
  expect(container.textContent).not.toMatch(
    new RegExp(['신' + '선', '추천 ' + '구매', '등' + '급', '좋' + '음', '나' + '쁨'].join('|')),
  );
});
it('지도 3점포 강조와 바텀시트 닫기·포커스 복귀를 지원한다', async () => {
  const { container } = show('/map?item=item:green_onion');
  await screen.findByText('대파 파는 점포 3곳');
  expect(container.querySelectorAll('[data-highlight="true"]')).toHaveLength(3);
  const store = screen.getByRole('button', { name: '점포 A-05 · 판매 점포' });
  store.focus();
  fireEvent.click(store);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: '점포 A-05', level: 2 })).toBeInTheDocument();
  const close = within(dialog).getByRole('button', { name: '닫기' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(store).toHaveFocus();
  fireEvent.click(store);
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('홈에서 파일 선택 후 결과와 지도로 이동한다', async () => {
  show('/');
  fireEvent.click(screen.getByRole('link', { name: '찍기' }));
  const file = screen.getByLabelText('사진 촬영 또는 앨범 선택');
  fireEvent.change(file, {
    target: { files: [new File(['sample'], 'onion.jpg', { type: 'image/jpeg' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: '품목 확인하기' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '결과 보기' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  await screen.findByRole('heading', { name: '대파' });
  fireEvent.click(screen.getByRole('link', { name: '파는 점포 보기' }));
  expect(await screen.findByText('대파 파는 점포 3곳')).toBeInTheDocument();
});
it('시장 미선택이면 선택 화면을 거쳐 원래 흐름으로 돌아온다', async () => {
  localStorage.removeItem('market');
  show('/scan');
  await screen.findByRole('heading', { name: '시장 선택' });
  fireEvent.click(await screen.findByRole('button', { name: /시연 시장/ }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '사진으로 품목 찾기' })).toBeInTheDocument(),
  );
});
it('선물 구성은 과일 품목과 출처를 표시한다', async () => {
  show('/recommend');
  fireEvent.click(screen.getByRole('button', { name: '선물' }));
  fireEvent.click(screen.getByRole('button', { name: '구성 보기' }));
  expect(await screen.findByRole('heading', { name: '사과' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: '점포 보기' })).toHaveLength(2);
  expect(screen.getAllByText('팀 구성 예시 · 샘플')).toHaveLength(2);
});
it('비로그인 상인은 보호된 화면에서 상인 시작으로 이동한다', async () => {
  show('/merchant/sale/new');
  expect(await screen.findByRole('heading', { name: '상인이신가요?' })).toBeInTheDocument();
  expect(screen.queryByLabelText('할인가')).not.toBeInTheDocument();
});
it('화면 오류를 설명하고 재시도 버튼을 표시한다', async () => {
  window.history.replaceState({}, '', '/?fail=1');
  show('/map');
  expect(await screen.findByRole('alert')).toHaveTextContent('샘플 요청에 실패했어요');
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
});
it('낮은 신뢰도에서 후보와 동의어 검색으로 확정할 수 있다', async () => {
  show('/scan');
  fireEvent.change(screen.getByLabelText('사진 촬영 또는 앨범 선택'), {
    target: { files: [new File(['x'], 'uncertain.jpg', { type: 'image/jpeg' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: '품목 확인하기' }));
  expect(await screen.findByRole('button', { name: '대파 65%' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '목록에 없어요' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '파' } });
  fireEvent.click(await screen.findByRole('button', { name: '대파' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '결과 보기' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
  expect(await screen.findByRole('heading', { name: '대파' })).toBeInTheDocument();
});
