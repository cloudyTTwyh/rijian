const CACHE = 'rijian-v7';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* 用 CACHE 名做查询参数逐个拉取，强制绕过 HTTP 缓存和 CDN 边缘缓存。
   否则多个文件可能新旧混着存进同一个缓存桶，出现「新页面 + 旧脚本」的错乱。
   存的时候仍用原始 URL，保证运行时 caches.match 能命中。 */
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async url => {
    try {
      const sep = url.includes('?') ? '&' : '?';
      const resp = await fetch(url + sep + 'v=' + CACHE, { cache: 'reload' });
      if (resp && resp.ok) await cache.put(url, resp);
    } catch (err) {
      /* 单个文件失败不影响其它文件 */
    }
  }));
}

self.addEventListener('install', e => {
  e.waitUntil(
    precache()
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  // 版本文件必须走网络，不能命中缓存，否则永远检查不到新版
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fromNetwork = fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });

      return cached || fromNetwork;
    })
  );
});
