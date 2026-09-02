(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback != null ? fallback : key;
  }

  function payload() {
    var raw = window.__VC_BOT_FAQ;
    if (!raw || typeof raw !== "object") return { categories: [], items: [] };
    return {
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  }

  var data = payload();
  var activeCategory = data.categories.length ? String(data.categories[0].id) : "";

  function faClass(iconKey) {
    var k = String(iconKey || "").trim();
    return k.indexOf("fa-") === 0 ? k : "fa-question-circle";
  }

  function revealAccordion() {
    if (typeof window.__vcRevealRegoleAccordion === "function") {
      window.__vcRevealRegoleAccordion();
    }
  }

  function renderTabs() {
    var root = byId("vc-regole-tabs");
    if (!root) return;
    root.innerHTML = "";
    data.categories.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (cat.id === activeCategory ? " vc-regole-tab--on" : "");
      btn.setAttribute("data-cat", cat.id);
      var ic = document.createElement("i");
      ic.className = "fa " + faClass(cat.tabIcon);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + String(cat.label || cat.id)));
      btn.addEventListener("click", function () {
        activeCategory = cat.id;
        renderTabs();
        renderList();
      });
      root.appendChild(btn);
    });
    revealAccordion();
  }

  function renderList() {
    var root = byId("vc-regole-list");
    if (!root) return;
    root.innerHTML = "";
    var list = data.items.filter(function (r) {
      return String(r.category || "") === activeCategory;
    });
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "vc-regole-state";
      empty.textContent = t("faq.empty", "Nessuna domanda in questa categoria.");
      root.appendChild(empty);
      return;
    }
    var cards = [];
    list.forEach(function (r) {
      var det = document.createElement("details");
      det.className = "vc-regole-card";
      var sum = document.createElement("summary");
      var ico = document.createElement("span");
      ico.className = "vc-regole-card-ico";
      var ii = document.createElement("i");
      ii.className = "fa " + faClass(r.icon);
      ii.setAttribute("aria-hidden", "true");
      ico.appendChild(ii);
      var main = document.createElement("div");
      main.className = "vc-regole-card-main";
      var h = document.createElement("p");
      h.className = "vc-regole-card-title";
      h.textContent = String(r.title || "");
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-question-circle";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + String(r.tag || "FAQ")));
      main.appendChild(h);
      main.appendChild(tag);
      var chev = document.createElement("span");
      chev.className = "vc-regole-card-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.innerHTML = '<i class="fa fa-chevron-down"></i>';
      sum.appendChild(ico);
      sum.appendChild(main);
      sum.appendChild(chev);
      var body = document.createElement("div");
      body.className = "vc-regole-card-body";
      var inner = document.createElement("div");
      inner.className = "vc-regole-card-body-inner";
      var lab = document.createElement("span");
      lab.className = "vc-regole-body-label";
      lab.textContent = t("faq.answer", "RISPOSTA");
      var p = document.createElement("div");
      p.className = "vc-regole-body-text";
      p.style.whiteSpace = "pre-wrap";
      p.textContent = String(r.body || "");
      inner.appendChild(lab);
      inner.appendChild(p);
      body.appendChild(inner);
      det.appendChild(sum);
      det.appendChild(body);
      cards.push(det);
      root.appendChild(det);
    });
    cards.forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (!det.open) return;
        cards.forEach(function (other) {
          if (other !== det) other.open = false;
        });
      });
    });
    revealAccordion();
  }

  function init() {
    renderTabs();
    renderList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
