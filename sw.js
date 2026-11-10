/* START PLAY — deixa o player abrir mesmo sem internet (usa a última versão baixada).
   Sempre tenta a rede primeiro; o cache só entra quando a rede falha ou demora. */
var SHELL = "sp-shell-v1";
var FILES = ["./", "index.html", "config.js", "agenda.js", "jpeg-decoder.js", "logo.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){ return c.addAll(FILES) })["catch"](function(){}).then(function(){ return self.skipWaiting() }));
});
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()) });

self.addEventListener("fetch", function(e){
  var req = e.request, u = new URL(req.url);
  if(req.method !== "GET" || u.origin !== self.location.origin) return;       // Supabase e mídias: o player cuida
  var path = u.pathname;
  if(/version\.txt$|\.apk$|painel|sw\.js$/.test(path)) return;                // sempre direto da rede
  e.respondWith(networkFirst(req, u));
});

function networkFirst(req, u){
  return new Promise(function(resolve){
    var done = false;
    function fromCache(){
      return caches.open(SHELL).then(function(c){ return c.match(req, { ignoreSearch:true }) });
    }
    var slow = setTimeout(function(){
      fromCache().then(function(c){ if(c && !done){ done = true; resolve(c) } });
    }, 6000);
    fetch(req).then(function(res){
      if(res && res.ok && !u.search){ var copy = res.clone(); caches.open(SHELL).then(function(c){ c.put(req, copy) }) }
      if(!done){ done = true; clearTimeout(slow); resolve(res) }
    })["catch"](function(){
      fromCache().then(function(c){ if(!done){ done = true; clearTimeout(slow); resolve(c || Response.error()) } });
    });
  });
}
