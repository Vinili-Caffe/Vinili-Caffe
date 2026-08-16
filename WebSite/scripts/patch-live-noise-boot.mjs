/**
 * Patch live HTML: refresh early extension/Turnstile noise boot to match build-site.mjs.
 * Does not rebuild the whole site — only replaces the known inline boot script.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VC_SITE_ROOT || "/var/www/viniliecaffe";

const NEW_BOOT =
  `<script>(function(){function s(x,d){try{d=d||0;if(x&&typeof x==="object"){var p=[];if(x.message!=null)p.push(String(x.message));if(x.stack!=null)p.push(String(x.stack));if(x.name!=null)p.push(String(x.name));if(d<2&&x.reason!=null)p.push(s(x.reason,d+1));if(d<2&&x.error!=null)p.push(s(x.error,d+1));if(p.length)return p.join(" ")}return String(x||"")}catch(e){return""}}function n(x){var m=s(x);return /listener indicated an asynchronous response/i.test(m)||/listener.*returning true.*(?:message )?channel closed/i.test(m)||/asynchronous response by returning true/i.test(m)||/message channel closed before a response was received/i.test(m)||/channel closed before a response was received/i.test(m)||/closed before a response was received/i.test(m)||/could not establish connection\\.?\\s*receiving end does not exist/i.test(m)||/message port closed before a response was received/i.test(m)||/extension context invalidated/i.test(m)||/unchecked runtime\\.lasterror/i.test(m)||/wrappedSendMessageCallback/i.test(m)||/cookieCrumbler\\.js/i.test(m)||/chrome-extension:\\/\\//i.test(m)||/moz-extension:\\/\\//i.test(m)||(/cannot read properties of undefined/i.test(m)&&/useCache/i.test(m))||(/font-size:\\s*0;\\s*color:\\s*transparent/i.test(m)&&/NaN/i.test(m))||/challenges\\.cloudflare\\.com/i.test(m)}function tf(a){try{var f=String(a[0]||"");if(/font-size:\\s*0;\\s*color:\\s*transparent/i.test(f))return true;if(/%c%d/i.test(f)&&(a[1]!==a[1]||a[1]==null))return true}catch(e){}return false}function h(e){if(!n(e&&e.reason)&&!n(e&&e.message)&&!n(e&&e.error))return;try{e.preventDefault();e.stopImmediatePropagation()}catch(_e){}}window.addEventListener("unhandledrejection",h,true);window.addEventListener("error",h,true);window.onunhandledrejection=h;["error","warn","log","info","debug"].forEach(function(l){var o=console[l];if(typeof o!=="function")return;console[l]=function(){if(tf(arguments))return;var a="";for(var i=0;i<arguments.length;i++)a+=" "+s(arguments[i]);if(n(a)||/forced reflow while executing javascript took/i.test(a))return;return o.apply(console,arguments)}})})();</script>`;

const BOOT_RE =
  /<script>\(function\(\)\{function s\(x,d\)\{try\{d=d\|\|0;if\(x&&typeof x==="object"\)\{var p=\[\];if\(x\.message!=null\)p\.push\(String\(x\.message\)\);if\(x\.stack!=null\)p\.push\(String\(x\.stack\)\);if\(x\.name!=null\)p\.push\(String\(x\.name\)\);if\(d<2&&x\.reason!=null\)p\.push\(s\(x\.reason,d\+1\)\);if\(d<2&&x\.error!=null\)p\.push\(s\(x\.error,d\+1\)\);if\(p\.length\)return p\.join\(" "\)\}return String\(x\|\|""\)\}catch\(e\)\{return""\}\}function n\(x\)\{var m=s\(x\);return[\s\S]*?\}\)\(\);<\/script>/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".audit") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

let changed = 0;
let scanned = 0;
for (const file of walk(ROOT)) {
  scanned += 1;
  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("listener indicated an asynchronous response")) continue;
  if (!BOOT_RE.test(html)) continue;
  const next = html.replace(BOOT_RE, NEW_BOOT);
  if (next === html) continue;
  fs.writeFileSync(file, next);
  changed += 1;
  console.log("patched", path.relative(ROOT, file));
}
console.log(`done scanned=${scanned} changed=${changed}`);
