// AnimePlay Service Worker
// Minimal stub to prevent 404 errors.
// Full PWA caching support can be added here when needed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
