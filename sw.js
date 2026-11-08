// Cache de l'app pour qu'elle s'ouvre hors ligne et d'un seul bloc.
// Les fichiers viennent du cache : sans nouvelle version, personne ne reçoit les changements.
// À chaque version, changer CACHE ici (c'est ce qui déclenche la mise à jour) et VERSION dans js/core/config.js.
// Tout nouveau fichier de js/ s'ajoute à SHELL. scripts/check.py vérifie les deux.
const CACHE = 'sc-0.28.0';
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
  'js/modules/courses/editor.js',
  'js/modules/courses/foyer.js',
  'js/modules/courses/index.js',
  'js/modules/courses/model.js',
  'js/modules/courses/panier.js',
  'js/modules/courses/semaine.js',
  'js/modules/courses/shop.js',
  'js/modules/courses/starters.js',
  'js/modules/courses/views.js',
  'js/modules/gtd/actions.js',
  'js/modules/gtd/frise.js',
  'js/modules/gtd/history.js',
  'js/modules/gtd/index.js',
  'js/modules/gtd/model.js',
  'js/modules/gtd/rows.js',
  'js/modules/gtd/sheets.js',
  'js/modules/gtd/views.js',
  'js/modules/notes/editor.js',
  'js/modules/notes/index.js',
  'js/modules/notes/views.js',
  'js/modules/sport/editor.js',
  'js/modules/sport/exercises.js',
  'js/modules/sport/index.js',
  'js/modules/sport/live.js',
  'js/modules/sport/model.js',
  'js/modules/sport/programs.js',
  'js/modules/sport/stats.js',
  'js/modules/sport/import.js',
  'js/modules/sport/fit.js',
  'js/modules/sport/views.js',
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

// Tout vient du cache de la version : jamais de mélange d'anciens et de nouveaux modules, jamais d'attente du réseau.
// La mise à jour arrive d'un bloc, quand le navigateur installe un nouveau sw.js.
// Le reste du même domaine (icônes, autres pages) et les polices sont mis en cache au premier passage.
// Les appels à Supabase (autre domaine) et les fichiers ouverts à part (raccourcis) ne passent jamais par ici.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const vendor = url.hostname === 'cdn.jsdelivr.net' || /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !vendor) return;
  const navigate = req.mode === 'navigate';
  if (navigate && !/\/(index\.html)?$/.test(url.pathname)) return;
  const key = navigate ? 'index.html' : req;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: own });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
      return res;
    })
  );
});

// Notifications de Brain (envoyées par la fonction Supabase brain)
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
