import { isMock, request } from './client';
import * as mock from './mock/merchant';
import type { AuthRequest, Captcha, User } from '../types/contract';
export const me = () => (isMock ? mock.me() : request<{ user: User }>('/auth/me'));
export const login = (q: AuthRequest) =>
  isMock
    ? mock.login(q)
    : request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(q) });
export const signup = (q: AuthRequest) =>
  isMock
    ? mock.signup(q)
    : request<{ user: User }>('/auth/signup', { method: 'POST', body: JSON.stringify(q) });
export const logout = () =>
  isMock ? mock.logout() : request<void>('/auth/logout', { method: 'POST' });

/** 자동입력 방지 숫자(서버가 그린 그림을 그대로 씀). mock은 캡차를 쓰지 않아 null */
export const getCaptcha = (): Promise<Captcha | null> =>
  isMock ? Promise.resolve(null) : request<Captcha>('/auth/captcha');
/** 손님 가입도 서버의 동일한 가입 계약을 사용해요. */
export const signupCustomer = (q: AuthRequest) => signup({ ...q, role: 'customer' });
