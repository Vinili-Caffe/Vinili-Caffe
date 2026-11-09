/**
 * Boot sincrono (head): ripara la PWA quando torna su dopo tanto tempo "rotta" (senza CSS).
 * Causa: la pagina in memoria punta a file /_next/static/ di un deploy vecchio che non esistono più
 * (404) → scritte sparse e immagini giganti. Qui:
 *  1) se un CSS/JS di /_next/static/ non carica → ricarica la pagina;
 *  2) al ritorno in primo piano dopo ≥ 10 min: se il CSS della pagina non esiste più sul server
 *     (nuovo deploy) o le variabili del tema non ci sono → ricarica;
 *  3) al caricamento, se il CSS non è applicato → ricarica.
 * Una ricarica al massimo ogni 30 s (sessionStorage), così non va mai in loop.
 * La destinazione di una notifica cliccata resta nella cache del SW e la legge NotifNavigate dopo il reload.
 * Marker: pwaHealth1
 */
export const PWA_HEALTH_BOOT = `(function(){try{
if(window.__vcPwaHealth)return;window.__vcPwaHealth=1;
var KEY="vc-pwa-heal-at";
function heal(why){
  try{var at=Number(sessionStorage.getItem(KEY)||"0")||0;if(at&&Date.now()-at<30000)return;sessionStorage.setItem(KEY,String(Date.now()));sessionStorage.setItem("vc-pwa-heal-why",String(why||""))}catch(e){}
  try{location.reload()}catch(e2){}
}
function cssOk(){
  try{
    if(!document.documentElement)return true;
    var v=getComputedStyle(document.documentElement).getPropertyValue("--color-espresso");
    return!!String(v||"").trim();
  }catch(e){return true}
}
function isNextAsset(u){return /\\/_next\\/static\\//.test(String(u||""))}
window.addEventListener("error",function(ev){
  try{
    var t=ev&&ev.target;
    if(!t||t===window)return;
    var tag=String(t.tagName||"").toUpperCase();
    if(tag==="LINK"&&isNextAsset(t.href)&&String(t.rel||"").indexOf("stylesheet")!==-1)heal("css-404");
    else if(tag==="SCRIPT"&&isNextAsset(t.src))heal("js-404");
  }catch(e){}
},true);
function checkLoaded(){setTimeout(function(){if(!cssOk())heal("no-css")},1800)}
if(document.readyState==="complete")checkLoaded();else window.addEventListener("load",checkLoaded);
var hiddenAt=0;
function staleCheck(){
  if(!cssOk()){heal("no-css-resume");return}
  if(!hiddenAt||Date.now()-hiddenAt<600000)return;
  try{
    var links=document.querySelectorAll('link[rel="stylesheet"][href*="/_next/static/"]');
    if(!links.length)return;
    var href=links[0].href;
    fetch(href,{method:"HEAD",cache:"no-store"}).then(function(r){if(r&&r.status===404)heal("new-deploy")}).catch(function(){});
  }catch(e){}
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="hidden"){hiddenAt=Date.now();return}
  staleCheck();hiddenAt=0;
});
window.addEventListener("pageshow",function(ev){if(ev&&ev.persisted)setTimeout(function(){if(!cssOk())heal("bfcache-no-css")},400)});
}catch(eAll){}})();`;
