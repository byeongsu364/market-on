import { isMock } from './client';
import * as mock from './mock/favorites';
import type { Favorite } from '../types/contract';
export type { NotifySettings } from './mock/favorites';

// 단골 점포와 알림(지시서 030 5장 표: /me/favorites, 푸시 구독). 백엔드에 아직 없어서 mock에서만 열고,
// live에서는 favoritesAvailable=false로 화면이 단골 버튼과 목록을 숨김.
export const favoritesAvailable = isMock;
const unavailable = () =>
  Promise.reject({ code: 'NOT_AVAILABLE', message: '단골 점포는 아직 준비 중이에요.' });
export const getFavorites = (): Promise<Favorite[]> => (isMock ? mock.list() : Promise.resolve([]));
export const saveFavorite = (favorite: Omit<Favorite, 'notify'>) =>
  isMock ? mock.save(favorite) : unavailable();
export const removeFavorite = (store_id: string) =>
  isMock ? mock.remove(store_id) : unavailable();
export const getNotifySettings = () => (isMock ? mock.settings() : unavailable());
export const saveNotifySettings = (value: mock.NotifySettings) =>
  isMock ? mock.saveSettings(value) : unavailable();
