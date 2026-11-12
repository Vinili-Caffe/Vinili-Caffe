/**
 * Boot sincrono (head), dopo API_FETCH_BOOT: velocizza le letture dall'API in tutto il sito.
 *  - due richieste GET uguali in contemporanea → una sola richiesta (la seconda aspetta la prima);
 *  - una GET già fatta da poco → risposta subito dalla memoria (30 s dashboard, 15 s resto del sito);
 *  - qualsiasi scrittura (POST/PATCH/PUT/DELETE) all'API svuota la memoria, così dopo un salvataggio
 *    i dati si rileggono sempre freschi.
 * La chiave include il token (Authorization) e ignora il parametro anti-cache `_=`.
 * Escluse le letture "live" (chat ticket, notifiche, stato, dirette, importazioni in corso…).
 * Marker: apiCache2 (gen bump: GET in-flight non ripopola store dopo una scrittura)
 */
export const API_CACHE_BOOT = `(function(){try{
if(window.__vcApiCache)return;window.__vcApiCache=2;
var base=window.fetch.bind(window);
var store=new Map();var inflight=new Map();var MAX=120;var gen=0;
var LIVE=/(notif|live|status|heartbeat|twitch|stream|chat|typing|presence|migration|workflow|poll|minigame|messages|tickets|avvento[/]claim|contest[/][^/?]+[/](feed|swipe))/i;
function urlOf(i){try{return typeof i==="string"?i:(i&&i.url)||""}catch(e){return""}}
function methodOf(i,n){var m=(n&&n.method)||(i&&typeof i!=="string"&&i.method)||"GET";return String(m).toUpperCase()}
function authOf(i,n){try{var h=(n&&n.headers)||(i&&typeof i!=="string"&&i.headers);if(!h)return"";if(typeof Headers!=="undefined"&&h instanceof Headers)return h.get("Authorization")||"";if(Array.isArray(h)){for(var k=0;k<h.length;k++)if(String(h[k][0]).toLowerCase()==="authorization")return String(h[k][1]);return""}for(var key in h)if(key.toLowerCase()==="authorization")return String(h[key]);return""}catch(e){return""}}
function isApi(u){return /\\/(webhooks|v1)\\//.test(u)}
function keyOf(u,auth){try{var x=new URL(u,location.href);x.searchParams.delete("_");return x.origin+x.pathname+"?"+x.searchParams.toString()+"#"+auth}catch(e){return u+"#"+auth}}
function ttlOf(u){return /\\/site-dashboard\\//.test(u)?30000:15000}
function build(e){return new Response(e.body,{status:e.status,statusText:e.statusText,headers:e.headers})}
window.__vcApiCacheClear=function(){gen++;store.clear()};
window.fetch=function(i,n){
  var u=urlOf(i);
  try{
    if(!isApi(u))return base(i,n);
    var m=methodOf(i,n);
    if(m!=="GET"&&m!=="HEAD"){gen++;store.clear();return base(i,n)}
    if(m!=="GET"||LIVE.test(u)||(n&&n.cache==="reload"))return base(i,n);
    var k=keyOf(u,authOf(i,n));
    var hit=store.get(k);
    if(hit&&Date.now()-hit.at<ttlOf(u))return Promise.resolve(build(hit));
    var p=inflight.get(k);
    if(!p){
      var myGen=gen;
      p=base(i,n).then(function(res){
        if(!res||!res.ok||res.status!==200)return{raw:res};
        var ct=String(res.headers.get("content-type")||"");
        if(ct.indexOf("json")===-1&&ct.indexOf("text/")===-1)return{raw:res};
        return res.clone().text().then(function(body){
          var h={};try{res.headers.forEach(function(v,key){h[key]=v})}catch(e){}
          var e={at:Date.now(),body:body,status:res.status,statusText:res.statusText,headers:h};
          if(myGen===gen){store.set(k,e);if(store.size>MAX){var first=store.keys().next().value;store.delete(first)}}
          return{entry:e,raw:res,stale:myGen!==gen};
        },function(){return{raw:res}});
      });
      inflight.set(k,p);
      p.then(function(){inflight.delete(k)},function(){inflight.delete(k)});
      return p.then(function(r){return r.entry&&!r.stale?build(r.entry):(r.raw?r.raw.clone():r.raw)});
    }
    return p.then(function(r){return r.entry&&!r.stale?build(r.entry):(r.raw?r.raw.clone():r.raw)});
  }catch(e){return base(i,n)}
};
}catch(eAll){}})();`;
