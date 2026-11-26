import type { User } from '../../types/contract';

/** 로그인한 뒤 갈 곳 */
export const homeFor = (user: User) =>
  user.role === 'operator'
    ? '/admin'
    : user.role === 'market_admin'
      ? '/market-admin'
      : user.role === 'merchant'
        ? '/merchant'
        : '/';
