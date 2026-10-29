/**
 * Boot sincrono (head): ripristina l’ultima pagina PWA da vc-pwa-resume.
 * Allineato a WebSite/js/vc-pwa-resume-boot.js + maybeRestoreFromHome (landing).
 * Marker: pwaResumeReact1
 */
export const PWA_RESUME_BOOT = `(function(){try{
if(window.__vcPwaResumeBoot)return;window.__vcPwaResumeBoot=1;
var RESUME_KEY="vc-pwa-resume";
var SHELL_KEY="vc-pwa-shell";
var WANT_HOME_KEY="vc-pwa-want-home";
var UI_RESTORE_KEY="vc_pwa_ui_restore_v1";

function isOauthHash(h){h=String(h||"");return h.indexOf("access_token=")!==-1||h.indexOf("error=")!==-1}
try{var oh=String(location.hash||"");if(isOauthHash(oh)){window.__vcOauthCallbackPending=1;try{sessionStorage.setItem("vc_oauth_hash_capture_v1",oh)}catch(e0){}}}catch(e1){}

function mq(m){try{return!!(window.matchMedia&&window.matchMedia("(display-mode: "+m+")").matches)}catch(e){return false}}
function isPwa(){if(mq("standalone")||mq("fullscreen")||mq("minimal-ui")||mq("window-controls-overlay"))return true;try{return!!navigator.standalone}catch(e){return false}}
function wasShell(){if(isPwa())return true;try{return localStorage.getItem(SHELL_KEY)==="1"}catch(e){return false}}
function markShell(){if(!isPwa())return;try{localStorage.setItem(SHELL_KEY,"1");localStorage.setItem("vc_pwa_installed_v1","1")}catch(e){}}

function stripApp(){try{var s=String(location.search||"");if(!/[?&]app=/.test(s))return;var p=new URLSearchParams(s.charAt(0)==="?"?s.slice(1):s);var app=String(p.get("app")||"").trim();if(!app)return;try{window.__vcPwaColdApp=true;window.__vcPwaColdAppAt=Date.now();sessionStorage.setItem("vc-pwa-cold-app",String(Date.now()));sessionStorage.setItem("vc-pwa-cold-app-id",app)}catch(eF){window.__vcPwaColdApp=true}p.delete("app");var qs=p.toString();var next=(location.pathname||"/")+(qs?"?"+qs:"")+(location.hash||"");if(typeof history.replaceState==="function")history.replaceState(history.state,"",next)}catch(eS){}}

function stripBadSearch(search){var s=String(search||"");if(!s||s==="?")return"";try{var u=new URLSearchParams(s.charAt(0)==="?"?s.slice(1):s);["code","state","error","error_description","access_token","token_type","expires_in","app"].forEach(function(k){u.delete(k)});var out=u.toString();return out?"?"+out:""}catch(e){return""}}

function safePath(path){var raw=String(path||"");if(!raw||raw.charAt(0)!=="/")return"";if(raw.indexOf("\\\\")!==-1||/^\\/\\//.test(raw)||raw.indexOf("://")!==-1)return"";if(raw.length>240)return"";try{var u=new URL(raw,location.origin);if(u.origin!==location.origin)return"";var p=String(u.pathname||"/").replace(/\\/index\\.html$/i,"")||"/";if(p!=="/"&&p.charAt(p.length-1)!=="/")p+="/";var norm=(p.replace(/\\/+$/,"")||"/").toLowerCase();if(/\\/accesso-richiesto\\/?$/.test(norm)||norm.indexOf("/oauth")===0)return"";var q=stripBadSearch(u.search||"");var h=String(u.hash||"");if(h.indexOf("access_token=")!==-1)h="";if(h.length>80)h="";return p+q+h}catch(e){return""}}

function wantHome(){try{if(sessionStorage.getItem(WANT_HOME_KEY)==="1")return true}catch(e){}try{var raw=localStorage.getItem(WANT_HOME_KEY);if(!raw)return false;var d=null;try{d=JSON.parse(raw)}catch(eP){}var at=Number(d&&d.t)||0;return!at||Date.now()-at<60000}catch(e2){return false}}

function isColdHome(){try{if(window.__vcPwaColdApp)return true;var coldAt=Number(sessionStorage.getItem("vc-pwa-cold-app")||"0")||0;if(coldAt>0&&Date.now()-coldAt<20000)return true}catch(eC){}try{if(/[?&]app=/.test(String(location.search||"")))return true}catch(e){}try{var nav=performance.getEntriesByType&&performance.getEntriesByType("navigation");if(nav&&nav[0]&&nav[0].type==="reload")return false}catch(eN){}try{if(document.referrer){var ref=new URL(document.referrer);var h=String(ref.hostname||"").toLowerCase();if(h==="viniliecaffe.it"||h==="www.viniliecaffe.it"||h===location.hostname)return false}}catch(eR){}return isPwa()}

function pathOnly(p){return String(p||"/").split("?")[0].split("#")[0].replace(/\\/+$/,"")||"/"}

stripApp();
markShell();

try{if(window.__vcOauthCallbackPending||isOauthHash(location.hash))return}catch(eO){}

if(!isPwa()&&!wasShell())return;

var herePath=pathOnly(location.pathname||"/");
/* Deep link / notifica: path ≠ home → non toccare (niente replace verso resume/home) */
if(herePath!=="/"){
  try{sessionStorage.setItem("vc-pwa-left-start","1")}catch(eL){}
  return;
}

if(wantHome()){try{localStorage.setItem(RESUME_KEY,JSON.stringify({p:"/",t:Date.now()}))}catch(eW){}return}
if(!isColdHome())return;

var data=null;
try{data=JSON.parse(localStorage.getItem(RESUME_KEY)||"null")}catch(eJ){}
var dest=safePath(data&&data.p);
if(!dest||pathOnly(dest)==="/")return;
/* pushClickNavIos2: aspetta il boot notif (cache SW) — altrimenti resume vince su start_url. */
try{sessionStorage.setItem(UI_RESTORE_KEY,"1");window.__vcPwaResumePending=1;window.__vcPwaResumeCandidate=dest}catch(eF){}
try{document.documentElement.style.background="#0e0906"}catch(eBg){}
setTimeout(function(){
  try{
    if(window.__vcPwaResumeSkip||window.__vcNotifNavDone)return;
    if(sessionStorage.getItem("vc-notif-pending-nav"))return;
  }catch(eSkip){}
  var hereNow=pathOnly(location.pathname||"/");
  if(hereNow!=="/")return;
  try{location.replace(dest)}catch(eNav){try{location.href=dest}catch(e2){}}
},180);
}catch(eAll){}})();`;
