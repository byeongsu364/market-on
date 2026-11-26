import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Recommend from '../pages/Recommend';
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
beforeEach(() => {
  vi.mocked(recommend).mockReset().mockResolvedValue(response);
});
it('현재 시장 요청과 카드·수량·합계·근거·모델을 표시한다', async () => {
  render(
    <Wrapper>
      <Recommend />
    </Wrapper>,
  );
  fireEvent.click(screen.getByRole('button', { name: '구성 보기' }));
  await screen.findByText('껍질을 확인해요.');
  expect(recommend).toHaveBeenCalledWith({
    purpose: '집밥',
    relation: '가족',
    headcount: 2,
    budget: 20000,
    market_id: 'market:demo',
  });
  expect(screen.getByText('3개')).toBeInTheDocument();
  expect(screen.getByText(/예상 합계 3,000원/)).toHaveTextContent('예산 20,000원 (17,000원 남음)');
  expect(screen.getByText(response.note)).toBeInTheDocument();
  expect(screen.getByText('GPT')).toBeInTheDocument();
  expect(screen.getByText(/검수 전/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '점포 A-01' })).toHaveAttribute(
    'href',
    '/map?item=item%3Aapple&store=s',
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
  fireEvent.click(screen.getByRole('button', { name: '구성 보기' }));
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
  fireEvent.click(screen.getByRole('button', { name: '구성 보기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('질문이 많아요');
});
