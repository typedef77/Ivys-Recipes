// Ivy's Recipes - Service Worker
// Uses stale-while-revalidate for app files to ensure updates are always fetched
const CACHE_NAME = 'ivys-recipes-v25';

// Core app files that should use stale-while-revalidate strategy
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

// Static assets that can use cache-first strategy
const STATIC_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Pacifico&family=Playfair+Display:wght@600&display=swap'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app assets');
                return cache.addAll([...APP_FILES, ...STATIC_ASSETS]);
            })
            .then(() => self.skipWaiting()) // Immediately activate new SW
    );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all pages immediately
    );
});

// Check if a request is for a core app file
function isAppFile(url) {
    const pathname = url.pathname;
    return pathname.endsWith('/') ||
           pathname.endsWith('/index.html') ||
           pathname.endsWith('.html') ||
           pathname.endsWith('.css') ||
           pathname.endsWith('.js') ||
           pathname.endsWith('manifest.json');
}

// Check if request is for fonts (can be cached longer)
function isFontRequest(url) {
    return url.href.includes('fonts.googleapis.com') ||
           url.href.includes('fonts.gstatic.com');
}

// Fetch event - different strategies for different content
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle POST requests for share target (file sharing)
    if (event.request.method === 'POST' && url.searchParams.has('share')) {
        event.respondWith(handleShareTarget(event.request));
        return;
    }

    // Skip other non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests except for fonts
    const isExternal = url.origin !== location.origin;
    if (isExternal && !isFontRequest(url)) {
        return;
    }

    // Use different strategies based on request type
    if (isAppFile(url) && !isExternal) {
        // STALE-WHILE-REVALIDATE for app files
        // Serve from cache immediately, but ALWAYS fetch update in background
        event.respondWith(staleWhileRevalidate(event.request));
    } else {
        // CACHE-FIRST for fonts and other static assets
        event.respondWith(cacheFirst(event.request));
    }
});

// Stale-while-revalidate: Return cached version immediately, fetch update in background
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    // Always fetch from network to get latest version
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
            // Update cache with new version
            cache.put(request, networkResponse.clone());

            // Notify all clients that an update is available
            notifyClientsOfUpdate();
        }
        return networkResponse;
    }).catch(() => {
        // Network failed, cached version will be used
        return null;
    });

    // Return cached version immediately if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

// Cache-first: Check cache first, fallback to network
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Network failed and not in cache
        if (request.destination === 'document') {
            return caches.match('./index.html');
        }
        return null;
    }
}

// Notify clients that new content is available
async function notifyClientsOfUpdate() {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
        client.postMessage({ type: 'CONTENT_UPDATED' });
    });
}

// Handle messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CHECK_FOR_UPDATES') {
        // Force check for SW updates
        self.registration.update();
    }
});

// Handle share target POST requests
async function handleShareTarget(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('photos');

        // Get all clients
        const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        // Convert files to base64 for passing to the app
        const fileData = [];
        for (const file of files) {
            if (file instanceof File && file.type.startsWith('image/')) {
                const arrayBuffer = await file.arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(arrayBuffer)
                        .reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                fileData.push({
                    name: file.name,
                    type: file.type,
                    dataUrl: `data:${file.type};base64,${base64}`
                });
            }
        }

        // Send file data to open client or store for later
        if (clients.length > 0) {
            clients[0].postMessage({
                type: 'SHARED_FILES',
                files: fileData
            });
        } else {
            // Store in cache temporarily
            const cache = await caches.open('shared-files-temp');
            await cache.put('pending-shares', new Response(JSON.stringify(fileData)));
        }

        // Redirect to the app
        return Response.redirect('./?share=photos&received=true', 303);
    } catch (error) {
        console.error('Error handling share target:', error);
        return Response.redirect('./', 303);
    }
}
