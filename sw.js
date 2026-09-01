// 柯仪学习工作台 - Service Worker（离线缓存 + 应用壳）
const CACHE = 'keyi-app-v34';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域直接放行，不缓存

  // version.json / news.json 必须每次走网络，保证版本自检和每日新闻实时
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/news.json')) return;

  const isJS = url.pathname.endsWith('.js');
  const isCSS = url.pathname.endsWith('.css');
  const isHTML = req.mode === 'navigate';

  // 页面 / JS / CSS：网络优先，断网时退回缓存（保证每次发版立刻生效）
  if (isHTML || isJS || isCSS) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  // 其它静态资源（图片/字体/数据）：缓存优先，首次加载后离线可用
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
