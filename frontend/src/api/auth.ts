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
/** 손님 계정(030): 백엔드에 역할 customer가 아직 없어 mock에서만 */
export const signupCustomer = (q: AuthRequest) =>
  isMock
    ? mock.signupCustomer(q)
    : Promise.reject({ code: 'NOT_AVAILABLE', message: '손님 계정은 준비 중이에요.' });
