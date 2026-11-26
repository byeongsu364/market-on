import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AskPanel from '../components/domain/AskPanel';
import AskAnswer from '../components/domain/AskAnswer';
import { SessionContext, useSessionState } from '../store/session';
import { ask } from '../api/ask';
import type { AskResponse } from '../types/contract';
vi.mock('../api/ask', () => ({ ask: vi.fn() }));
const response: AskResponse = {
  kind: 'answer',
  intent: 'store',
  item_id: 'item:green_onion',
  item_name: '대파',
  answer: '냉장 보관해요.',
  citations: [
    {
      title: '보관 자료',
      publisher: '기관',
      url: 'https://example.org',
      license: null,
      draft: true,
    },
  ],
  model: 'gemma4:e4b',
  cached: false,
  removed: 0,
};
function Wrapper({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  return <SessionContext value={state}>{children}</SessionContext>;
}
beforeEach(() => {
  vi.mocked(ask).mockReset().mockResolvedValue(response);
  Element.prototype.scrollIntoView = vi.fn();
});
it('칩·자유 질문 계약, 중복 스크롤, 200자 제한과 최대 3개 답', async () => {
  render(
    <Wrapper>
      <AskPanel itemId="item:green_onion" />
    </Wrapper>,
  );
  fireEvent.click(screen.getByRole('button', { name: '보관' }));
  await screen.findByText('냉장 보관해요.');
  expect(ask).toHaveBeenLastCalledWith({
    intent: 'store',
    item_id: 'item:green_onion',
    market_id: 'market:demo',
  });
  fireEvent.click(screen.getByRole('button', { name: '보관' }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  const input = screen.getByLabelText('자유 질문');
  fireEvent.change(input, { target: { value: '가'.repeat(201) } });
  expect(screen.getByRole('button', { name: '묻기' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '냉동해도 돼요?' } });
  fireEvent.click(screen.getByRole('button', { name: '묻기' }));
  await screen.findByRole('heading', { name: '냉동해도 돼요?' });
  expect(ask).toHaveBeenLastCalledWith({
    question: '냉동해도 돼요?',
    item_id: 'item:green_onion',
    market_id: 'market:demo',
  });
  for (const label of ['손질', '제철']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    await screen.findByRole('heading', { name: label });
  }
  expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
    '제철',
    '손질',
    '냉동해도 돼요?',
  ]);
});
it('대기 중 비활성과 aria-live 및 503 재시도', async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(ask).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { container } = render(
    <Wrapper>
      <AskPanel itemId="item:green_onion" />
    </Wrapper>,
  );
  fireEvent.click(screen.getByRole('button', { name: '보관' }));
  // 040: 기다리는 동안 단계 문구 (근거 찾는 중 → 정리 중 → 답 쓰는 중)
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('근거 찾는 중');
  for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  reject({ status: 503 });
  expect(await screen.findByRole('alert')).toHaveTextContent('지금은 답변을 찾을 수 없어요');
  fireEvent.click(screen.getByRole('button', { name: '다시' }));
  await screen.findByText('냉장 보관해요.');
  expect(ask).toHaveBeenCalledTimes(2);
});
it.each([429, 500])('오류 %s', async (status) => {
  vi.mocked(ask).mockRejectedValueOnce({ status, message: '서버 오류' });
  render(
    <Wrapper>
      <AskPanel itemId="item:green_onion" />
    </Wrapper>,
  );
  fireEvent.click(screen.getByRole('button', { name: '보관' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    status === 429 ? '질문이 많아요. 잠시 뒤에 다시 물어봐 주세요' : '서버 오류',
  );
});
it.each([
  ['answer', '냉장 보관해요.'],
  ['no_evidence', '냉장 보관해요.'],
  ['price', '기준시세 자료가 아직 없어요'],
  ['where', '이 시장에서 0곳이 팔아요'],
  ['out_of_scope', '이 품목의 고르는 법·보관·손질·제철을 물어볼 수 있어요'],
] as const)('kind %s', (kind, text) => {
  render(
    <Wrapper>
      <AskAnswer question="질문" response={{ ...response, kind }} />
    </Wrapper>,
  );
  expect(screen.getByText(text)).toBeInTheDocument();
  if (kind === 'price')
    expect(screen.getByRole('link')).toHaveAttribute('href', '#price-comparison');
  if (kind === 'where') expect(screen.getByRole('link')).toHaveAttribute('href', '#selling-stores');
});
it.each([
  ['gemma4:e4b', false, 'Gemma'],
  ['openai:gpt', false, 'GPT'],
  [null, true, '저장된 답'],
] as const)('출처·검수 전·모델 %s', (model, cached, label) => {
  render(
    <Wrapper>
      <AskAnswer question="질문" response={{ ...response, model, cached }} />
    </Wrapper>,
  );
  expect(screen.getByRole('link', { name: '보관 자료' })).toHaveAttribute('target', '_blank');
  expect(screen.getByText(/검수 전/)).toBeInTheDocument();
  expect(screen.getByText(label)).toBeInTheDocument();
});

it('기준시세와 단위를 표시한다', async () => {
  const { ask: mockAsk } = await import('../api/mock');
  const price = await mockAsk({ intent: 'price', item_id: 'item:green_onion' });
  render(
    <Wrapper>
      <AskAnswer question="얼마예요?" response={price} />
    </Wrapper>,
  );
  expect(
    screen.getByText(`기준시세 ${price.price!.reference_price.toLocaleString('ko-KR')}원 / 1단`),
  ).toBeInTheDocument();
});
