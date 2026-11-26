import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../store/AuthProvider';
import { SessionProvider } from '../store/SessionProvider';
import Signup from '../pages/account/Signup';
import { request } from '../api/client';
vi.mock('../api/client', () => ({ isMock: false, request: vi.fn() }));
it('live 손님 가입은 캡차와 customer 역할을 보내고 next로 돌아간다', async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === '/auth/captcha')
      return { captcha_id: 'captcha-34', image: 'data:image/png;base64,AA==', expires_in: 300 };
    if (path === '/auth/signup')
      return {
        user: {
          id: 'buyer',
          login_id: 'buyer',
          role: 'customer',
          status: 'approved',
          store: null,
          market: null,
        },
      };
    return { user: null };
  });
  render(
    <MemoryRouter initialEntries={['/signup?next=%2Fs%2Fstore%3AA-05']}>
      <SessionProvider>
        <AuthProvider>
          <Routes>
            <Route path="/signup" element={<Signup />} />
            <Route path="/s/:id" element={<p>돌아온 점포</p>} />
          </Routes>
        </AuthProvider>
      </SessionProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('radio', { name: '손님' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'buyer' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password-34' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password-34' } });
  fireEvent.click(
    screen.getByRole('checkbox', { name: '이용약관과 개인정보 처리방침에 동의해요' }),
  );
  const captcha = await screen.findByRole('textbox', { name: '자동 가입 방지' });
  fireEvent.change(captcha, { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
  await screen.findByText('돌아온 점포');
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        login_id: 'buyer',
        password: 'password-34',
        captcha_id: 'captcha-34',
        captcha_answer: '1234',
        role: 'customer',
      }),
    }),
  );
});
