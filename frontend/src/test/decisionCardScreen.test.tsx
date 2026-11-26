import { vi, it, expect, beforeEach } from 'vitest';

// 앱 전체를 mock API로 그리는 화면 테스트라 다른 테스트와 동시에 돌면 느림
vi.setConfig({ testTimeout: 20000 });
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import App from '../App';
import { drawCard } from '../utils/decisionCard';
vi.mock('../utils/decisionCard', async (original) => ({
  ...(await original<typeof import('../utils/decisionCard')>()),
  drawCard: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(drawCard)
    .mockReset()
    .mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
});
function Jump() {
  const navigate = useNavigate();
  const [apple, setApple] = useState(false);
  return (
    <button
      onClick={() => {
        navigate(apple ? '/items/item:green_onion' : '/items/item:apple');
        setApple(!apple);
      }}
    >
      품목 변경
    </button>
  );
}
const show = (path = '/items/item:green_onion') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Jump />
    </MemoryRouter>,
  );
async function openCard() {
  const button = await screen.findByRole('button', { name: '판단 카드 만들기' });
  // 기준시세를 기본 품종으로 한 번 더 받는 동안 버튼이 잠깐 다시 꺼짐 → 켜졌을 때 눌러 시트가 열릴 때까지
  await waitFor(
    () => {
      if (!(button as HTMLButtonElement).disabled) fireEvent.click(button);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
    { timeout: 10000 },
  );
  const dialog = screen.getByRole('dialog');
  return within(dialog).findByRole('img', {}, { timeout: 5000 });
}
it('버튼으로 시트를 열고 Canvas 호출·체크·파일 이름·미지원 공유를 확인한다', async () => {
  show();
  await screen.findByRole('heading', { name: '대파' });
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  const image = await openCard();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(image).toHaveAttribute('alt', expect.stringContaining('1개 확인'));
  expect(drawCard).toHaveBeenCalledWith(
    expect.any(HTMLCanvasElement),
    expect.objectContaining({ photo: undefined, count: expect.stringContaining('1개 확인') }),
  );
  expect(screen.getByRole('link', { name: '저장' })).toHaveAttribute(
    'download',
    expect.stringMatching(/^market-on-대파-\d{4}-\d{2}-\d{2}\.png$/),
  );
  expect(
    within(screen.getByRole('dialog')).queryByRole('button', { name: '공유' }),
  ).not.toBeInTheDocument();
});
it('파일 공유가 지원되면 생성한 PNG File을 공유한다', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
  show();
  await openCard();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '공유' }));
  expect(share).toHaveBeenCalledWith({
    files: [
      expect.objectContaining({
        name: expect.stringContaining('market-on-대파'),
        type: 'image/png',
      }),
    ],
  });
});
it('파일 공유 불가면 공유 버튼을 숨긴다', async () => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  show();
  await openCard();
  expect(
    within(screen.getByRole('dialog')).queryByRole('button', { name: '공유' }),
  ).not.toBeInTheDocument();
});
it('품목이 바뀌면 체크가 초기화된다', async () => {
  show();
  await screen.findByRole('heading', { name: '대파' });
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: '품목 변경' }));
  await screen.findByRole('heading', { name: '사과' });
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '품목 변경' }));
  await screen.findByRole('heading', { name: '대파' });
  screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
});
it('생성 중 로딩과 생성 실패를 표시한다', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(drawCard).mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  show();
  const button = await screen.findByRole('button', { name: '판단 카드 만들기' });
  await waitFor(
    () => {
      if (!(button as HTMLButtonElement).disabled) fireEvent.click(button);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
    { timeout: 10000 },
  );
  expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
    '카드를 만들고 있어요',
  );
  reject(new Error('Canvas failed'));
  expect(await screen.findByRole('alert')).toHaveTextContent('카드를 만들지 못했어요');
});

it('촬영 File을 결과로 전달해 기기 안의 카드 데이터에 담는다', async () => {
  show('/scan');
  const photo = new File(['sample'], 'local-photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(await screen.findByLabelText('사진 찍기'), {
    target: { files: [photo] },
  });
  const result = await screen.findByRole('button', { name: '결과 보기' });
  await waitFor(() => expect(result).toBeEnabled());
  fireEvent.click(result);
  await openCard();
  expect(drawCard).toHaveBeenCalledWith(
    expect.any(HTMLCanvasElement),
    expect.objectContaining({ photo }),
  );
});

it('시트를 닫으면 미리보기 Object URL을 해제한다', async () => {
  show();
  await openCard();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sample');
});
it('시트 머리에 안심On·저장이 있고 레시피 보기는 없다', async () => {
  show();
  await screen.findByRole('heading', { name: '대파' });
  await openCard();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: '판단 카드' })).toHaveTextContent('안심On');
  expect(within(dialog).getByRole('link', { name: '저장' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /레시피 보기/ })).toBeNull();
  // 제철은 이달의 식재료로 채워서 그림
  await waitFor(() => expect(vi.mocked(drawCard).mock.calls.at(-1)?.[1]).toHaveProperty('season'));
});
