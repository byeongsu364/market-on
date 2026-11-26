// 지시서 030: 단골 점포와 알림 설정의 mock. 백엔드(/me/favorites, 푸시 구독)가 생기기 전까지 이 기기 localStorage에만 둬요.
// 처음에는 비어 있어요(예시 단골을 만들어 넣지 않음). 알림은 실제로 보내지 않고 설정 값만 저장해요.
import type { Favorite } from '../../types/contract';
import { mock } from './index';

export type NotifySettings = { sales: boolean; season: boolean };
const FAVORITES = 'mock-favorites';
const SETTINGS = 'mock-notify';
const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장할 수 없으면 이번 화면에서만 */
  }
};

export const list = () => mock(() => read<Favorite[]>(FAVORITES, []));
export const save = (favorite: Omit<Favorite, 'notify'>) =>
  mock(() => {
    const all = read<Favorite[]>(FAVORITES, []).filter((f) => f.store_id !== favorite.store_id);
    const next = [...all, { ...favorite, notify: true }];
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
  mock(() => read<NotifySettings>(SETTINGS, { sales: true, season: false }));
export const saveSettings = (value: NotifySettings) =>
  mock(() => {
    write(SETTINGS, value);
    return value;
  });
