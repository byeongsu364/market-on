import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Recommend from '../pages/shop/Shop';
import { SessionContext, useSessionState } from '../store/session';
import { recommend } from '../api/recommend';
import type { RecommendResponse } from '../types/contract';
vi.mock('../api/recommend', () => ({ recommend: vi.fn() }));
const response: RecommendResponse = {
  items: [
    {
      item_id: 'item:apple',
      name: '사과',
      quantity: 3,
      unit: 'unit:piece',
      unit_label: '개',
      unit_price: 1000,
      subtotal: 3000,
      reason: '껍질을 확인해요.',
      stores: [{ store_id: 's', name: '점포 A-01' }],
      sources: [{ title: '확인 자료', publisher: null, url: null, license: null, draft: true }],
    },
  ],
  total: 3000,
  budget: 20000,
  left: 17000,
  note: '기준시세로 계산한 예상 금액이에요. 실제 가격은 가게마다 달라요',
  model: 'openai:test',
};
function Wrapper({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  return (
    <MemoryRouter>
      <SessionContext value={state}>{children}</SessionContext>
    </MemoryRouter>
  );
}
// 장바구니 대화: 용도 → 인원 → 예산 빠른 답을 차례로 누르면 구성을 요청함
const compose = (purpose = '집밥') => {
  fireEvent.click(screen.getByRole('button', { name: purpose }));
  fireEvent.click(screen.getByRole('button', { name: '2명' }));
  fireEvent.click(screen.getByRole('button', { name: '2만원' }));
};
beforeEach(() => {
  vi.mocked(recommend).mockReset().mockResolvedValue(response);
});
it('현재 시장 요청과 카드·수량·합계·근거·모델을 표시한다', async () => {
  render(
    <Wrapper>
      <Recommend />
    </Wrapper>,
  );
  compose();
  await screen.findByText('껍질을 확인해요.');
  expect(recommend).toHaveBeenCalledWith({
    purpose: '집밥',
    relation: '가족',
    headcount: 2,
    budget: 20000,
    market_id: 'market:demo',
  });
  expect(screen.getByText('3개')).toBeInTheDocument();
  expect(screen.getByText('3,000원')).toBeInTheDocument();
  expect(screen.getByText('예산 20,000원 안이에요')).toBeInTheDocument();
  expect(screen.getByText(response.note)).toBeInTheDocument();
  expect(screen.getByText('GPT')).toBeInTheDocument();
  expect(screen.getByText(/검수 전/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '점포 A-01' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&item=item%3Aapple&store=s',
  );
  expect(screen.getByRole('link', { name: '한 번에 지도에서 보기' })).toHaveAttribute(
    'href',
    '/shop/route?market=market%3Ademo&item=item%3Aapple',
  );
});
it('로딩과 빈 구성 note를 표시한다', async () => {
  let resolve!: (value: RecommendResponse) => void;
  vi.mocked(recommend).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(
    <Wrapper>
      <Recommend />
    </Wrapper>,
  );
  compose();
  expect(screen.getByText(/구성을 만들고 있어요/)).toBeInTheDocument();
  resolve({
    ...response,
    items: [],
    total: 0,
    left: 20000,
    model: null,
    note: '이 시장에서 파는 품목의 시세가 아직 없어요',
  });
  await screen.findByText('이 시장에서 파는 품목의 시세가 아직 없어요');
  expect(screen.queryByText('GPT')).not.toBeInTheDocument();
});
it('오류를 표시한다', async () => {
  vi.mocked(recommend).mockRejectedValue(new Error('질문이 많아요. 잠시 뒤에 다시 물어봐 주세요'));
  render(
    <Wrapper>
      <Recommend />
    </Wrapper>,
  );
  compose();
  expect(await screen.findByRole('alert')).toHaveTextContent('질문이 많아요');
});
it('장바구니는 도우미가 차례로 묻고, 구성 뒤 조건 하나만 바꿔 다시 짠다', async () => {
  render(
    <Wrapper>
      <Recommend />
    </Wrapper>,
  );
  expect(screen.getByRole('heading', { name: '장바구니' })).toBeInTheDocument();
  expect(screen.getByText('어떤 용도로 구매하세요?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '모임용' }));
  expect(screen.getByText('몇 명이 드세요?')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('인원 직접 입력'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: '확인' }));
  expect(screen.getByText('12명')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('예산 직접 입력'), { target: { value: '45000' } });
  fireEvent.click(screen.getByRole('button', { name: '확인' }));
  await screen.findByText('껍질을 확인해요.');
  expect(recommend).toHaveBeenLastCalledWith(
    expect.objectContaining({ purpose: '모임', headcount: 12, budget: 45000 }),
  );
  fireEvent.click(screen.getByRole('button', { name: '예산 바꾸기' }));
  fireEvent.click(screen.getByRole('button', { name: '3만원' }));
  await waitFor(() => expect(recommend).toHaveBeenCalledTimes(2));
  expect(recommend).toHaveBeenLastCalledWith(
    expect.objectContaining({ purpose: '모임', headcount: 12, budget: 30000 }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole('heading', { name: '이렇게 구매하면 돼요' })).toHaveLength(2),
  );
  fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
  expect(screen.queryByRole('heading', { name: '이렇게 구매하면 돼요' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '집밥' })).toBeInTheDocument();
});
