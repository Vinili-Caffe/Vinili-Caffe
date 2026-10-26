/**
 * Rumore console da estensioni Chrome + lastError (come sito legacy).
 * Inline in <head> prima di tutto il resto.
 */
export const EXT_CONSOLE_BOOT = `(function(){try{
if(window.__vcExtConsoleBoot)return;window.__vcExtConsoleBoot=1;
var cr=window.chrome&&window.chrome.runtime;
if(cr){try{void cr.lastError;}catch(e0){}
try{if(typeof cr.sendMessage==="function"&&!cr.__vcLastErrBoot){var sm=cr.sendMessage.bind(cr);cr.sendMessage=function(){var a=[].slice.call(arguments),cb=typeof a[a.length-1]==="function"?a.pop():null;if(cb)a.push(function(){try{void cr.lastError;}catch(x){}try{return cb.apply(this,arguments);}catch(y){}});try{return sm.apply(cr,a);}catch(z){try{void cr.lastError;}catch(w){}}};cr.__vcLastErrBoot=1;}}catch(e1){}}
var re=/unchecked runtime\\.lasterror|could not establish connection|receiving end does not exist|message channel closed|asynchronous response|listener indicated|chrome-extension:\\/\\/|moz-extension:\\/\\/|youtubeblocker|content_script\\.js|the powerpreference option is currently ignored|no available adapters|websocket connection to .* failed|failed to execute '(?:insertBefore|removeChild)'|not a child of this node/i;
function wrap(l){var o=console[l];if(typeof o!=="function"||o.__vcExtConsoleBoot)return;function f(){try{var m="";for(var i=0;i<arguments.length;i++){var v=arguments[i];m+=" "+(v&&typeof v==="object"&&v.message!=null?String(v.message):String(v));}if(re.test(m))return;}catch(e){}return o.apply(console,arguments);}f.__vcExtConsoleBoot=1;try{Object.defineProperty(console,l,{configurable:true,enumerable:true,get:function(){return f;},set:function(fn){if(typeof fn==="function"&&!fn.__vcExtConsoleBoot)o=fn;}});}catch(e2){console[l]=f;}}
["error","warn"].forEach(wrap);
window.addEventListener("unhandledrejection",function(ev){try{var r=ev&&ev.reason;var m=String((r&&r.message)||r||"");if(re.test(m)){ev.preventDefault();ev.stopImmediatePropagation();}}catch(e3){}},true);
window.addEventListener("error",function(ev){try{var m=String((ev&&ev.message)||"");if(re.test(m)){ev.preventDefault();ev.stopImmediatePropagation();}}catch(e4){}},true);
}catch(e){}})();`;
