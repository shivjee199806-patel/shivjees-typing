/* Shivjee's Typing PWA service worker.
   Deliberately network-first/no-cache so existing live login, exams, results,
   payments and owner/candidate behavior remain controlled by the server. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(String(data.title || 'JP Typing').slice(0, 160), {
    body: String(data.body || 'नया अपडेट उपलब्ध है').slice(0, 180),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: String(data.tag || 'jp-notification'),
    data: { url: '/#notifications' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/#notifications', self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  })());
});
