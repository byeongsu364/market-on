import { isMock, request } from './client';
import * as mock from './mock/merchant';
import type { AuthRequest, User } from '../types/contract';
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
