// Cache de l'app pour qu'elle s'ouvre hors ligne.
// Changer CACHE à chaque nouvelle version pour forcer la mise à jour,
// et ajouter ici tout nouveau fichier de js/ (sinon il manque hors ligne).
const CACHE = 'sc-v20';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'js/core/boot.js',
  'js/core/config.js',
  'js/core/events.js',
  'js/core/images.js',
  'js/core/links.js',
  'js/core/modules.js',
  'js/core/push.js',
  'js/core/share.js',
  'js/core/state.js',
  'js/core/store.js',
  'js/core/sync.js',
  'js/core/ui.js',
  'js/core/users.js',
  'js/core/util.js',
  'js/core/views.js',
  'js/main.js',
  'js/modules/agenda/index.js',
  'js/modules/agenda/views.js',
  'js/modules/agenda/apple.js',
  'js/modules/agenda/dnd.js',
  'js/modules/courses/index.js',
  'js/modules/gtd/actions.js',
  'js/modules/gtd/index.js',
  'js/modules/gtd/model.js',
  'js/modules/gtd/rows.js',
  'js/modules/gtd/sheets.js',
  'js/modules/gtd/views.js',
  'js/modules/notes/editor.js',
  'js/modules/notes/index.js',
  'js/modules/notes/views.js',
  'js/modules/sport/index.js',
  'config.js',
  'manifest.webmanifest',
  'manifest-papier.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/papier-180.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  // cache: 'reload' contourne le cache HTTP (GitHub Pages garde les fichiers 10 min),
  // sinon la nouvelle version pourrait enregistrer d'anciens fichiers
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fichiers de l'app (même domaine) : réseau d'abord pour toujours avoir la dernière version,
// cache si hors ligne ou si le réseau met plus de 3 s.
// Bibliothèques et polices (versions figées) : cache d'abord.
// Les appels à Supabase (autre domaine) ne passent jamais par le cache.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const vendor = url.hostname === 'cdn.jsdelivr.net' || /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !vendor) return;
  const key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      if (vendor && cached) return cached;
      const network = fetch(own ? new Request(req, { cache: 'no-cache' }) : req)
        .then(res => { if (res.ok || res.type === 'opaque') cache.put(key, res.clone()); return res; });
      if (!cached) return network;
      const late = new Promise(r => setTimeout(() => r(cached), 3000));
      return Promise.race([network.catch(() => cached), late]);
    })
  );
});

// Notifications de Brain (envoyées par la fonction Supabase send-reminders)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Brain', {
    body: d.body || '',
    tag: d.tag,
    icon: 'icons/icon-192.png',
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  const id = (url.match(/#\/open\/([\w-]+)/) || [])[1];
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list[0];
    if (win) { if (id) win.postMessage({ open: id }); return win.focus(); }
    return clients.openWindow(url);
  }));
});
