// Market-On 서비스 워커(지시서 030): 앱 틀만 캐시해요. API(/api)와 지도는 캐시하지 않아요.
// 배포마다 이름을 바꾸지 않아도 되게, 화면 파일은 네트워크 우선 + 실패할 때만 캐시를 써요.
const CACHE = 'market-on-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/brand/icon.svg', '/brand/logo-light.svg', '/fonts/PretendardVariable.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  const isPage = request.mode === 'navigate';
  const isAsset = /^\/(assets|brand|fonts|items)\//.test(url.pathname);
  if (!isPage && !isAsset) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(isPage ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => caches.match(isPage ? '/' : request).then((hit) => hit || Response.error())),
  );
});

function safeNotificationUrl(value) {
  try { const url = new URL(value || '/me/notifications', self.location.origin); return url.origin === self.location.origin ? url.href : new URL('/me/notifications', self.location.origin).href; } catch { return new URL('/me/notifications', self.location.origin).href; }
}
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* malformed payload */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Market-On', {body:payload.body || '',icon:'/brand/icon.svg',data:{url:safeNotificationUrl(payload.url)}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients => {
    const existing = clients.find(client => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
