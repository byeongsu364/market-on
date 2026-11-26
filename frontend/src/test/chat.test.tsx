import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Chat from '../pages/shop/Chat';
import { SessionContext, useSessionState } from '../store/session';
import { chat } from '../api/chat';
import type { ChatResponse } from '../types/contract';
vi.mock('../api/chat', () => ({ chat: vi.fn() }));
const response: ChatResponse = {
  reply: '대파는 냉동 보관할 수 있어요.',
  tools: [{ name: 'ask_knowledge', label: '근거 자료 찾기' }],
  citations: [{ title: '보관 자료', publisher: '기관', url: null, license: null, draft: true }],
  items: [{ item_id: 'item:green_onion', name: '대파' }],
  model: 'gemma4:e4b',
  removed: 0,
};
function Wrapper({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  return (
    <MemoryRouter initialEntries={['/chat?item_id=item%3Agreen_onion']}>
      <SessionContext value={state}>{children}</SessionContext>
    </MemoryRouter>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(chat).mockReset().mockResolvedValue(response);
});
it('예시·말풍선·도구·출처·모델·품목 링크와 복원·새 대화', async () => {
  const first = render(
    <Wrapper>
      <Chat />
    </Wrapper>,
  );
  fireEvent.click(screen.getByRole('button', { name: '대파 냉동해도 돼요?' }));
  await screen.findByText(response.reply);
  expect(chat).toHaveBeenCalledWith({
    market_id: 'market:demo',
    item_id: 'item:green_onion',
    messages: [{ role: 'user', content: '대파 냉동해도 돼요?' }],
  });
  expect(screen.getByLabelText('내 질문')).toHaveTextContent('대파 냉동해도 돼요?');
  expect(screen.getByText('근거 자료 찾기')).toBeInTheDocument();
  expect(screen.getByText(/검수 전/)).toBeInTheDocument();
  expect(screen.getByText(/Gemma/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '대파 결과 보기' })).toHaveAttribute(
    'href',
    '/items/item%3Agreen_onion?market=market%3Ademo',
  );
  expect(screen.getByRole('link', { name: '대파 지도 보기' })).toHaveAttribute(
    'href',
    '/?market=market%3Ademo&item=item%3Agreen_onion',
  );
  first.unmount();
  render(
    <Wrapper>
      <Chat />
    </Wrapper>,
  );
  expect(screen.getByText(response.reply)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '새 대화' }));
  expect(screen.queryByText(response.reply)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '사과 어디서 팔아요?' })).toBeInTheDocument();
});
it.each([
  [429, '질문이 많아요. 잠시 뒤에 다시 물어봐 주세요'],
  [503, '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요'],
])('로딩·오류 %s·재전송 및 저장소 읽기 실패', async (status, message) => {
  const original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (this === sessionStorage) throw new Error('blocked');
    return original.call(this, key);
  });
  let reject!: (e: unknown) => void;
  vi.mocked(chat).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  render(
    <Wrapper>
      <Chat />
    </Wrapper>,
  );
  fireEvent.change(screen.getByLabelText('궁금한 점'), { target: { value: '대파?' } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  expect(screen.getByText('근거 찾는 중')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  reject({ status });
  await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled());
  expect(screen.getByLabelText('궁금한 점')).toHaveValue('대파?');
  expect(screen.getByText(message)).toBeInTheDocument();
  vi.restoreAllMocks();
});
