const CACHE_VERSION="sig-castelldefels-v0.6.2";
const STATIC_CACHE=`${CACHE_VERSION}-static`;
const DATA_CACHE=`${CACHE_VERSION}-data`;
const APP_SHELL=[
  "./",
  "./index.html",
  "./docs.html",
  "./offline.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/map3d.js",
  "./js/data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>!key.startsWith(CACHE_VERSION)).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }catch(error){
    const cached=await cache.match(request);
    if(cached)return cached;
    throw error;
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(STATIC_CACHE);
      try{
        const response=await fetch(request);
        if(response&&response.ok)cache.put(request,response.clone());
        return response;
      }catch(error){
        return await cache.match(request,{ignoreSearch:true})
          || await cache.match("./index.html",{ignoreSearch:true})
          || await cache.match("./offline.html",{ignoreSearch:true});
      }
    })());
    return;
  }

  if(url.origin===self.location.origin && (url.pathname.includes("/history/") || url.pathname.endsWith("/js/data.js"))){
    event.respondWith(networkFirst(request,DATA_CACHE).catch(()=>caches.match("./offline.html")));
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(networkFirst(request,STATIC_CACHE));
  }
});
