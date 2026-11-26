import { expect, it, vi } from 'vitest';
vi.mock('../api/client', () => ({ isMock: false, request: vi.fn() }));
import { recommend } from '../api/recommend';
import { request } from '../api/client';
const data = { purpose: '선물' as const, headcount: 2, budget: 10000, market_id: 'm' };
it('공통 클라이언트로 구성 요청을 보낸다', async () => {
  vi.mocked(request).mockResolvedValue({});
  await recommend(data);
  expect(request).toHaveBeenCalledWith('/recommend', {
    method: 'POST',
    body: JSON.stringify(data),
  });
});
it.each([
  [503, '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요'],
  [429, '질문이 많아요. 잠시 뒤에 다시 물어봐 주세요'],
])('오류 %s를 질문 화면 문구로 표시한다', async (status, message) => {
  vi.mocked(request).mockRejectedValue({ status });
  await expect(recommend(data)).rejects.toThrow(String(message));
});
