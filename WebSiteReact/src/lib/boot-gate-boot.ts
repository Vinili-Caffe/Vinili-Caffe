/** Sipario DOM (non solo classi html: React le riscrive all’hydrate). */
export const BOOT_GATE_BOOT = `(function(){try{
if(window.__vcBootGate)return;window.__vcBootGate=1;
try{if("scrollRestoration" in history)history.scrollRestoration="manual";}catch(e){}
try{window.scrollTo(0,0);}catch(e2){}
var root=document.documentElement;
root.classList.add("vc-boot-hold");
function ensureCurtain(){
  var c=document.getElementById("vc-boot-curtain");
  if(c)return c;
  c=document.createElement("div");
  c.id="vc-boot-curtain";
  c.setAttribute("aria-hidden","true");
  c.style.cssText="position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:#0e0906;";
  try{
    var light=root.getAttribute("data-vc-theme")==="light"||root.getAttribute("data-theme")==="light";
    if(light)c.style.background="#efe6dc";
  }catch(eL){}
  /* su <html>, non body: l’hydrate di React non lo cancella */
  root.appendChild(c);
  return c;
}
ensureCurtain();
function pin(){try{if(root.classList.contains("vc-boot-hold")||document.getElementById("vc-boot-curtain"))window.scrollTo(0,0);}catch(e3){}}
window.addEventListener("scroll",pin,{passive:true,capture:true});
window.__vcBootUnlock=function(){
try{window.removeEventListener("scroll",pin,true);}catch(e4){}
root.classList.remove("vc-boot-hold");
root.classList.add("vc-boot-ready");
var c=document.getElementById("vc-boot-curtain");
if(c&&c.parentNode)c.parentNode.removeChild(c);
};
window.setTimeout(function(){try{if(document.getElementById("vc-boot-curtain")||root.classList.contains("vc-boot-hold"))window.__vcBootUnlock();}catch(e5){}},900);
}catch(e){}})();`;
