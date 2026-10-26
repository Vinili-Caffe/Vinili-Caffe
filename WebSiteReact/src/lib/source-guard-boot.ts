/**
 * Deterrenza anti-devtools / tasto destro (come WebSite/js/vc-source-guard.js).
 * Non è sicurezza reale. Bypass owner + ?vc-dev=1 / Ctrl+Alt+Shift+D.
 */
export const OWNER_DISCORD_IDS = new Set(["295500038401163264"]);

export const SOURCE_GUARD_BOOT = `(function(){try{
if(window.__vcSourceGuard)return;window.__vcSourceGuard=1;
var OFF="vc-source-guard-off",OWN="vc-source-guard-owner-uid";
var OWNERS={"295500038401163264":1};
function isOwn(id){return!!OWNERS[String(id||"").trim()];}
function enable(){try{localStorage.setItem(OFF,"1");}catch(e){}window.__vcSourceGuardOff=1;try{document.documentElement.classList.remove("vc-source-guard-soft");}catch(e2){}}
function bypass(){try{var q=new URLSearchParams(location.search||"");var d=String(q.get("vc-dev")||"").toLowerCase(),g=String(q.get("vc-guard")||"").toLowerCase();
if(d==="1"||g==="off"){enable();return true;}if(d==="0"||g==="on"){try{localStorage.removeItem(OFF);}catch(e){}return false;}
if(localStorage.getItem(OFF)==="1"){window.__vcSourceGuardOff=1;return true;}
var rem=String(localStorage.getItem(OWN)||"").trim();if(isOwn(rem)){enable();return true;}
}catch(e){}return false;}
if(bypass())return;
function block(ev){try{ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();}catch(e){}return false;}
function editable(t){if(!t)return false;var el=t.nodeType===1?t:t.parentElement;return!!(el&&el.closest&&el.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]'));}
function classic(ev,k,key){var ctrl=ev.ctrlKey||ev.metaKey;if(!ctrl||ev.altKey)return false;if(ev.shiftKey&&!(k===90||key==="z"))return false;if(ev.shiftKey&&(k===90||key==="z"))return true;return k===65||k===67||k===86||k===88||k===89||k===90||key==="a"||key==="c"||key==="v"||key==="x"||key==="y"||key==="z";}
document.addEventListener("contextmenu",function(ev){if(window.__vcSourceGuardOff)return;if(editable(ev.target))return;return block(ev);},true);
document.addEventListener("dragstart",function(ev){if(window.__vcSourceGuardOff)return;var t=ev.target;if(t&&t.tagName==="IMG")return block(ev);},true);
document.addEventListener("keydown",function(ev){var k=ev.keyCode||ev.which||0,key=String(ev.key||"").toLowerCase(),ctrl=ev.ctrlKey||ev.metaKey,shift=ev.shiftKey,alt=ev.altKey;
if(ctrl&&alt&&shift&&(k===68||key==="d")){enable();try{ev.preventDefault();}catch(e){}return;}
if(window.__vcSourceGuardOff)return;if(classic(ev,k,key))return;
if(alt&&!ctrl&&(k===37||k===39||key==="arrowleft"||key==="arrowright"))return;
if(editable(ev.target)&&!(ctrl&&(k===83||key==="s")))return;
if(ctrl&&!shift&&(k===83||k===85||key==="s"||key==="u"))return block(ev);
if(ctrl&&shift&&(k===83||key==="s"))return block(ev);
if(k===123||key==="f12")return block(ev);
if(ctrl&&shift&&(k===73||k===74||k===67||k===75||key==="i"||key==="j"||key==="c"||key==="k"))return block(ev);
if(ctrl&&alt&&(k===73||key==="i"))return block(ev);
},true);
try{document.documentElement.classList.add("vc-source-guard-soft");}catch(e){}
window.__vcSourceGuardApi={off:enable,on:function(){try{localStorage.removeItem(OFF);}catch(e){}location.reload();}};
}catch(e){}})();`;
