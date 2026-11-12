/* START PLAY — deixa o player abrir mesmo sem internet (usa a última versão baixada).
   Sempre tenta a rede primeiro; o cache só entra quando a rede falha ou demora. */
var SHELL = "sp-shell-v1";
var FILES = ["./", "index.html", "config.js", "agenda.js", "cartoes.js", "jpeg-decoder.js", "qrcode.js", "logo.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){ return c.addAll(FILES) })["catch"](function(){}).then(function(){ return self.skipWaiting() }));
});
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()) });

self.addEventListener("fetch", function(e){
  var req = e.request, u = new URL(req.url);
  if(req.method !== "GET" || u.origin !== self.location.origin) return;       // Supabase e mídias: o player cuida
  var path = u.pathname;
  if(/version\.txt$|\.apk$|painel|conversor|anunciante|vendor\/|sw\.js$/.test(path)) return;                // sempre direto da rede
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
    fetchFresh(req).then(function(res){
      // "agenda.js?v=3.2.1" fica guardado como "agenda.js": sem internet abre a última versão baixada
      var key = !u.search ? req : /^\?v=[\w.-]+$/.test(u.search) ? u.origin + u.pathname : null;
      if(res && res.ok && key){ var copy = res.clone(); caches.open(SHELL).then(function(c){ c.put(key, copy) }) }
      if(!done){ done = true; clearTimeout(slow); resolve(res) }
    })["catch"](function(){
      fromCache().then(function(c){ if(!done){ done = true; clearTimeout(slow); resolve(c || Response.error()) } });
    });
  });
}

// pergunta ao servidor se o arquivo mudou (sem usar a cópia de até 10 min do navegador):
// depois de uma atualização, o player novo não abre com um pedaço da versão antiga
function fetchFresh(req){
  return fetch(req.url, { cache:"no-cache", credentials:"same-origin" })
    .then(function(res){ return res.redirected ? fetch(req) : res });
}
