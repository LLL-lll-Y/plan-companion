/* ============================================================
   计划陪伴 · Service Worker
   预缓存全部静态资源；版本号变更后清理旧缓存；
   导航请求走网络优先，断网回退到缓存的 index.html。
   ============================================================ */
'use strict';

var VERSION = '2026-11-11.7';
var CACHE_NAME = 'plan-companion-' + VERSION;
var CACHE_PREFIX = 'plan-companion-';

var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './scene.css',
  './views.css',
  './store.js',
  './timer.js',
  './scene.js',
  './tasks.js',
  './stats.js',
  './music.js',
  './settings.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  // 卡面与封面进预缓存，保证离线也有画面
  './assets/li-shen-window.jpg',
  './assets/li-shen-flowers.jpg',
  './assets/poster-video-wine-1.jpg',
  './assets/poster-video-wine-2.jpg',
  './assets/thumb-li-shen-window.jpg',
  './assets/thumb-li-shen-flowers.jpg',
  './assets/thumb-video-wine-1.jpg',
  './assets/thumb-video-wine-2.jpg'
  // 视频体积较大，不强制预缓存，按需缓存（见下方 fetch）
];

/* ---------- 安装：预缓存 ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 逐个缓存，个别资源失败不影响整体安装
      return Promise.all(PRECACHE.map(function (url) {
        var request = new Request(url, { cache: 'reload' });
        return cache.add(request).catch(function (err) {
          console.warn('[SW] 预缓存失败：', url, err);
        });
      }));
    })
  );
});

/* ---------- 激活：清理旧版本缓存 ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- 接收页面指令 ---------- */
self.addEventListener('message', function (event) {
  var data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

/* ---------- 请求拦截 ---------- */
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 视频的 Range 请求交给浏览器处理，避免缓存到不完整的分片
  if (request.headers.has('range')) return;

  // 页面导航：网络优先，断网回退缓存页面
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put('./index.html', copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          return cached || caches.match('./') || Response.error();
        });
      })
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        return cached || Response.error();
      });
      return cached || network;
    })
  );
});
