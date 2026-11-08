/**
 * Boot async (head): se lo SW ha stashato una URL da notificationclick,
 * vai lì PRIMA del resume PWA (altrimenti iOS resta su start_url/home).
 * Marker: pushClickNavIos5
 */
export const PWA_NOTIF_NAV_BOOT = `(async function(){try{
if(window.__vcNotifNavBoot)return;window.__vcNotifNavBoot=1;
function markReady(){try{window.__vcNotifNavReady=1}catch(eR){}}
if(!("caches" in window)){markReady();return}
var CACHE="vc-notif-pending-v1";
var REQ="/__vc_notif_pending";
function pathKey(href){
  try{
    var u=new URL(String(href||""),location.origin);
    if(u.origin!==location.origin)return"";
    var p=String(u.pathname||"/");
    if(p!=="/"&&p.charAt(p.length-1)!=="/")p+="/";
    return p+String(u.search||"")+String(u.hash||"");
  }catch(e){return""}
}
try{
var cache=await caches.open(CACHE);
var res=await cache.match(REQ);
if(!res){markReady();return}
var data=null;
try{data=await res.json()}catch(eJ){data=null}
var url=String(data&&data.url||"").trim();
var at=Number(data&&data.t||0)||0;
if(!url||(at>0&&Date.now()-at>180000)){
  await cache.delete(REQ).catch(function(){});
  markReady();
  return;
}
var u=null;
try{u=new URL(url,location.origin)}catch(eU){markReady();return}
if(u.origin!==location.origin){markReady();return}
var next=pathKey(u.href);
if(!next){markReady();return}
var here=pathKey(location.href);
if(next===here){
  await cache.delete(REQ).catch(function(){});
  try{sessionStorage.setItem("vc-pwa-left-start","1");sessionStorage.removeItem("vc-pwa-want-home");sessionStorage.removeItem("vc-notif-pending-nav")}catch(eS){}
  window.__vcNotifNavDone=1;
  markReady();
  return;
}
/* Non cancellare lo stash finché non siamo arrivati: iOS può riaprire start_url. */
try{
  sessionStorage.setItem("vc-pwa-left-start","1");
  sessionStorage.removeItem("vc-pwa-want-home");
  sessionStorage.setItem("vc-notif-pending-nav",next);
  window.__vcNotifNavDone=1;
  window.__vcPwaResumeSkip=1;
}catch(eT){}
markReady();
try{location.replace(next)}catch(eR){try{location.href=next}catch(e2){}}
}catch(eInner){markReady()}
}catch(eAll){try{window.__vcNotifNavReady=1}catch(eZ){}}})();`;
