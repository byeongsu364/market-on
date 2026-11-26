import { isMock, request } from './client';
import * as mock from './mock/favorites';
import type { Favorite } from '../types/contract';
export type NotifySettings = { sales: boolean; season: boolean };
export const favoritesAvailable = true;
export const getFavorites = (): Promise<Favorite[]> =>
  isMock ? mock.list() : request('/me/favorites');
export const saveFavorite = (
  favorite: Omit<Favorite, 'notify'>,
  notify = true,
): Promise<Favorite[]> =>
  isMock
    ? mock.save(favorite, notify)
    : request(`/me/favorites/${encodeURIComponent(favorite.store_id)}`, {
        method: 'PUT',
        body: JSON.stringify({ notify }),
      });
export const removeFavorite = (id: string): Promise<Favorite[]> =>
  isMock
    ? mock.remove(id)
    : request(`/me/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getNotifySettings = (): Promise<NotifySettings> =>
  isMock ? mock.settings() : request('/me/notifications/settings');
export const saveNotifySettings = (value: NotifySettings): Promise<NotifySettings> =>
  isMock
    ? mock.saveSettings(value)
    : request('/me/notifications/settings', { method: 'PUT', body: JSON.stringify(value) });
export type Notice = {
  id: number;
  kind: 'sale' | 'season';
  title: string;
  body: string;
  url: string;
  created_at: string;
  read_at: string | null;
};
export const getNotifications = (unread = false): Promise<Notice[]> =>
  isMock ? mock.inbox(unread) : request(`/me/notifications?unread=${unread}`);
export const readNotification = (id: number): Promise<void> =>
  isMock ? mock.readNotice(id) : request(`/me/notifications/${id}/read`, { method: 'POST' });
export const readAllNotifications = (): Promise<void> =>
  isMock ? mock.readAll() : request('/me/notifications/read-all', { method: 'POST' });
export function safeNoticeUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? url.pathname + url.search + url.hash
      : '/me/notifications';
  } catch {
    return '/me/notifications';
  }
}
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw new Error(
      '이 브라우저는 알림을 지원하지 않아요. 아이폰은 홈 화면에 추가한 뒤에 알림을 받을 수 있어요',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error('알림 권한이 거부되었어요. 브라우저 설정에서 알림을 허용해 주세요.');
  if (isMock) return;
  const { public_key } = await request<{ public_key: string | null }>('/push/public-key');
  if (!public_key) throw new Error('웹 푸시를 준비 중이에요. 앱 안 알림은 받을 수 있어요.');
  const key = Uint8Array.from(
    atob(
      public_key.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (public_key.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await request('/me/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
}
