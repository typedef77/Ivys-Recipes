// Ivy's Recipes - Service Worker
const CACHE_NAME = 'ivys-recipes-v14';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Pacifico&family=Playfair+Display:wght@600&display=swap'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
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
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle POST requests for share target (file sharing)
    if (event.request.method === 'POST' && url.searchParams.has('share')) {
        event.respondWith(handleShareTarget(event.request));
        return;
    }

    // Skip other non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests except for fonts and the CORS proxy
    const url = new URL(event.request.url);
    const isExternalAsset = url.origin !== location.origin &&
        !url.href.includes('fonts.googleapis.com') &&
        !url.href.includes('fonts.gstatic.com');

    if (isExternalAsset) {
        // For external requests (like recipe fetching), just use network
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }

                // Not in cache, fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache the fetched response
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Network failed, try to return a fallback
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
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
