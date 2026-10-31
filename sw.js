// Cache de l'app pour qu'elle s'ouvre hors ligne.
// Changer CACHE à chaque nouvelle version pour forcer la mise à jour,
// et ajouter ici tout nouveau fichier de js/ (sinon il manque hors ligne).
const CACHE = 'sc-v3';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'js/core/boot.js',
  'js/core/config.js',
  'js/core/events.js',
  'js/core/images.js',
  'js/core/modules.js',
  'js/core/state.js',
  'js/core/store.js',
  'js/core/sync.js',
  'js/core/ui.js',
  'js/core/util.js',
  'js/core/views.js',
  'js/main.js',
  'js/modules/courses/index.js',
  'js/modules/gtd/actions.js',
  'js/modules/gtd/index.js',
  'js/modules/gtd/model.js',
  'js/modules/gtd/rows.js',
  'js/modules/gtd/sheets.js',
  'js/modules/gtd/views.js',
  'js/modules/sport/index.js',
  'config.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réponse immédiate depuis le cache, mise à jour en arrière-plan.
// Les appels à Supabase (autre domaine) ne passent jamais par le cache.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isShell = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (!isShell) return;
  const key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req)
        .then(res => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
