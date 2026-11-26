import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as auth from '../api/mock/merchant';
import * as reviews from '../api/mock/reviews';
const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const credentials = {
  login_id: 'happy_buyer',
  password: 'market-on-demo',
  role: 'customer' as const,
};
it('손님 가입 후 점포로 돌아와 리뷰 작성·수정·차단·삭제', async () => {
  show('/signup?next=%2Fs%2Fstore%3AA-05');
  fireEvent.change(await screen.findByLabelText('아이디'), {
    target: { value: credentials.login_id },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: credentials.password } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
    target: { value: credentials.password },
  });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  await screen.findByText('손님 리뷰');
  fireEvent.click(await screen.findByRole('button', { name: '리뷰 쓰기' }));
  fireEvent.click(await screen.findByRole('button', { name: '4점' }));
  fireEvent.change(screen.getByLabelText('리뷰 글'), { target: { value: '신선하고 친절해요' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('★ 4.0 · 손님 1명 평가');
  fireEvent.click(screen.getByRole('button', { name: '리뷰 고치기' }));
  const body = await screen.findByLabelText('리뷰 글');
  fireEvent.change(body, { target: { value: '씨 발' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('이 표현은 쓸 수 없어요.');
  fireEvent.change(body, { target: { value: '다시 방문할게요' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByText('다시 방문할게요');
  fireEvent.click(screen.getByRole('button', { name: '리뷰 고치기' }));
  fireEvent.click(await screen.findByRole('button', { name: '내 리뷰 지우기' }));
  await screen.findByText('★ — · 손님 0명 평가');
});
it('비로그인 쓰기는 로그인으로 이동하고 로그인 후 점포로 복귀', async () => {
  await auth.signup(credentials);
  await auth.logout();
  show('/s/store:A-05');
  fireEvent.click(await screen.findByRole('button', { name: '리뷰 쓰기' }));
  await screen.findByRole('heading', { name: '로그인' });
  expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute(
    'href',
    expect.stringContaining('next='),
  );
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: credentials.login_id } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: credentials.password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByText('손님 리뷰');
});
it('상인에게 손님 계정 안내', async () => {
  await auth.login(auth.demoCredentials());
  show('/s/store:A-05');
  await screen.findByText('리뷰는 손님 계정으로 쓸 수 있어요');
  expect(screen.queryByRole('button', { name: '리뷰 쓰기' })).not.toBeInTheDocument();
});
it('mock upsert, 마스킹, 평균, 횟수 제한', async () => {
  await auth.signup(credentials);
  for (let i = 0; i < 10; i++) await reviews.save('store:A-05', { rating: 4, body: '좋아요' });
  expect(await reviews.list('store:A-05')).toMatchObject({
    count: 1,
    average: 4,
    items: [{ author: 'hap***', mine: true }],
  });
  await expect(reviews.save('store:A-05', { rating: 3, body: '좋아요' })).rejects.toMatchObject({
    code: 'REVIEW_RATE_LIMIT',
  });
});

it('최근 3개에서 더 보기를 누르면 다음 리뷰를 표시한다', async () => {
  for (let i = 0; i < 4; i++) {
    await auth.signup({ ...credentials, login_id: `buyer_${i}` });
    await reviews.save('store:A-05', { rating: i + 1, body: `후기 ${i}` });
  }
  await auth.logout();
  show('/s/store:A-05');
  await screen.findByText('★ 2.5 · 손님 4명 평가');
  expect(screen.getAllByText(/^후기 /)).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: '리뷰 더 보기' }));
  await screen.findByText('후기 0');
  expect(screen.getAllByText(/^후기 /)).toHaveLength(4);
  expect(screen.queryByRole('button', { name: '리뷰 더 보기' })).not.toBeInTheDocument();
});
