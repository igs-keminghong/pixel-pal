// 像素行程夥伴 service worker：離線快取。改了檔案後把 VERSION 加 1，手機才會抓到新版。
const VERSION='v3';
const CACHE='pixel-pal-'+VERSION;
const CORE=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','vendor/supabase-2.118.0.js',
  'assets/badge.png',
  'assets/beagle_alert.png',
  'assets/beagle_blink.png',
  'assets/beagle_happy.png',
  'assets/beagle_idle.png',
  'assets/beagle_sleep.png',
  'assets/bg_chat.webp',
  'assets/bg_day.webp',
  'assets/bg_dusk.webp',
  'assets/bg_night.webp',
  'assets/bg_room.webp',
  'assets/btn_gold.png',
  'assets/btn_wood.png',
  'assets/bubble_body.png',
  'assets/bubble_tail.png',
  'assets/card.png',
  'assets/frame.png',
  'assets/ic_bag.png',
  'assets/ic_cal.png',
  'assets/ic_camera.png',
  'assets/ic_clock.png',
  'assets/ic_food.png',
  'assets/ic_friends.png',
  'assets/ic_gear.png',
  'assets/ic_hand.png',
  'assets/ic_heart.png',
  'assets/ic_home.png',
  'assets/ic_mail.png',
  'assets/ic_mount.png',
  'assets/parrot_alert.png',
  'assets/parrot_blink.png',
  'assets/parrot_happy.png',
  'assets/parrot_idle.png',
  'assets/parrot_sleep.png',
  'assets/plank.png',
  'assets/shiba_alert.png',
  'assets/shiba_blink.png',
  'assets/shiba_happy.png',
  'assets/shiba_idle.png',
  'assets/shiba_sleep.png',
  'assets/sign.png',
  'assets/star.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  // 頁面：先抓網路（拿到最新版），失敗才用快取
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return res}).catch(()=>caches.match('index.html')));return}
  // 圖片與字型：先用快取，沒有才抓網路並存起來
  if(u.origin===location.origin||/fonts\.(googleapis|gstatic)\.com/.test(u.host)){
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res})))}});
