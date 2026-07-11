// AttendX PWA Service Worker - v2 (Updated Dec 31, 2024)
const CACHE_NAME = 'AttendX-v2';
const urlsToCache = [
    '/icon.svg',
    '/manifest.json'
];

// Install event - cache basic resources
self.addEventListener('install', (event) => {
    console.log('Service Worker v2: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker v2: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - cleanup ALL old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker v2: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete ALL caches to force fresh content
                    console.log('Service Worker v2: Clearing cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - Network first for HTML/JS, cache for assets
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip API calls and external requests
    if (event.request.url.includes('/api/') ||
        event.request.url.includes('accounts.google.com') ||
        !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // For HTML and JS files, always fetch from network first
    const isHTMLorJS = event.request.url.endsWith('.html') ||
        event.request.url.endsWith('.js') ||
        event.request.url.endsWith('.jsx') ||
        event.request.url.endsWith('.css') ||
        event.request.mode === 'navigate';

    if (isHTMLorJS) {
        // Network first strategy
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
    } else {
        // Cache first for assets (images, fonts)
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    return response || fetch(event.request);
                })
        );
    }
});
