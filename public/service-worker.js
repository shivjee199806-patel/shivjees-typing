/* Shivjee's Typing PWA service worker.
   Deliberately network-first/no-cache so existing live login, exams, results,
   payments and owner/candidate behavior remain controlled by the server. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
