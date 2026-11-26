// 계정별 단골·설정·앱 안 알림 mock. 실제 웹 푸시 네트워크는 사용하지 않아요.
import type { Favorite } from '../../types/contract';
import { mock } from './index';
import { currentMockUser, mockUsers } from './merchant';
import type { ClosingSale } from '../../types/contract';

export type NotifySettings = { sales: boolean; season: boolean };
const accountKey = () => {
  const user = currentMockUser();
  if (!user || user.role !== 'customer' || user.status !== 'approved')
    throw new Error('손님 계정으로 이용할 수 있어요');
  return user.id;
};
const FAVORITES = 'mock-favorites';
const SETTINGS = 'mock-notify';
const read = <T>(key: string, fallback: T): T => {
  const account = accountKey();
  try {
    return (
      (JSON.parse(localStorage.getItem(`${key}:${account}`) ?? 'null') as T | null) ?? fallback
    );
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  const account = accountKey();
  try {
    localStorage.setItem(`${key}:${account}`, JSON.stringify(value));
  } catch {
    /* 저장할 수 없으면 이번 화면에서만 */
  }
};

export const list = () => mock(() => read<Favorite[]>(FAVORITES, []));
export const save = (favorite: Omit<Favorite, 'notify'>, notify = true) =>
  mock(() => {
    const all = read<Favorite[]>(FAVORITES, []).filter((f) => f.store_id !== favorite.store_id);
    const next = [...all, { ...favorite, notify }];
    write(FAVORITES, next);
    return next;
  });
export const remove = (store_id: string) =>
  mock(() => {
    const next = read<Favorite[]>(FAVORITES, []).filter((f) => f.store_id !== store_id);
    write(FAVORITES, next);
    return next;
  });
export const settings = () =>
  mock(() => read<NotifySettings>(SETTINGS, { sales: true, season: true }));
export const saveSettings = (value: NotifySettings) =>
  mock(() => {
    write(SETTINGS, value);
    return value;
  });

export const inbox = (unread = false) =>
  mock(() =>
    read<import('../favorites').Notice[]>('mock-inbox', []).filter((n) => !unread || !n.read_at),
  );
export const readNotice = (id: number) =>
  mock(() => {
    write(
      'mock-inbox',
      read<import('../favorites').Notice[]>('mock-inbox', []).map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  });
export const readAll = () =>
  mock(() => {
    write(
      'mock-inbox',
      read<import('../favorites').Notice[]>('mock-inbox', []).map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
    );
  });

function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function countForStore(storeId: string) {
  return mockUsers()
    .filter((u) => u.role === 'customer' && u.status === 'approved')
    .filter((u) =>
      stored<Favorite[]>(`mock-favorites:${u.id}`, []).some((f) => f.store_id === storeId),
    ).length;
}
export function notifySale(sale: ClosingSale, storeName: string, itemName: string) {
  for (const u of mockUsers().filter((u) => u.role === 'customer' && u.status === 'approved')) {
    const favorites = stored<Favorite[]>(`mock-favorites:${u.id}`, []);
    const settings = stored<NotifySettings>(`mock-notify:${u.id}`, { sales: true, season: true });
    if (!settings.sales || !favorites.some((f) => f.store_id === sale.store_id && f.notify))
      continue;
    const key = `mock-inbox:${u.id}`;
    const notices = stored<import('../favorites').Notice[]>(key, []);
    if (notices.some((n) => n.id === sale.id && n.kind === 'sale')) continue;
    const time = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(sale.ends_at));
    const body = `${storeName} · ${itemName} ${sale.sale_price.toLocaleString('ko-KR')}원 마감세일 (${time}까지)`;
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: sale.id,
          kind: 'sale',
          title: storeName,
          body,
          url: `/s/${encodeURIComponent(sale.store_id)}`,
          created_at: new Date().toISOString(),
          read_at: null,
        },
        ...notices,
      ]),
    );
  }
}
