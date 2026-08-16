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

  var activeCategory = "livelli";

  var categories = [
    { id: "livelli", labelKey: "faq.cat.livelli" },
    { id: "voce", labelKey: "faq.cat.voce" },
    { id: "giochi", labelKey: "faq.cat.giochi" },
    { id: "eventi", labelKey: "faq.cat.eventi" },
    { id: "staff", labelKey: "faq.cat.staff" },
  ];

  function tabIcon(catId) {
    var m = {
      livelli: "fa-line-chart",
      voce: "fa-music",
      giochi: "fa-gamepad",
      eventi: "fa-calendar",
      staff: "fa-users",
    };
    return m[catId] || "fa-question-circle";
  }

  var items = [
    { category: "livelli", titleKey: "faq.q1.title", tagKey: "faq.tag.livelli", icon: "fa-level-up", bodyKey: "faq.q1.body" },
    { category: "livelli", titleKey: "faq.q2.title", tagKey: "faq.tag.livelli", icon: "fa-puzzle-piece", bodyKey: "faq.q2.body" },
    { category: "voce", titleKey: "faq.q3.title", tagKey: "faq.tag.voce", icon: "fa-headphones", bodyKey: "faq.q3.body" },
    { category: "giochi", titleKey: "faq.q4.title", tagKey: "faq.tag.giochi", icon: "fa-trophy", bodyKey: "faq.q4.body" },
    { category: "eventi", titleKey: "faq.q5.title", tagKey: "faq.tag.eventi", icon: "fa-star", bodyKey: "faq.q5.body" },
    { category: "eventi", titleKey: "faq.q6.title", tagKey: "faq.tag.eventi", icon: "fa-star", bodyKey: "faq.q6.body" },
    { category: "staff", titleKey: "faq.q7.title", tagKey: "faq.tag.staff", icon: "fa-briefcase", bodyKey: "faq.q7.body" },
    { category: "staff", titleKey: "faq.q8.title", tagKey: "faq.tag.staff", icon: "fa-user-plus", bodyKey: "faq.q8.body" },
  ];

  function faClass(iconKey) {
    var k = String(iconKey || "").trim();
    return k.indexOf("fa-") === 0 ? k : "fa-question-circle";
  }

  function renderTabs() {
    var root = byId("vc-regole-tabs");
    if (!root) return;
    root.innerHTML = "";
    categories.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (cat.id === activeCategory ? " vc-regole-tab--on" : "");
      btn.setAttribute("data-cat", cat.id);
      var ic = document.createElement("i");
      ic.className = "fa " + tabIcon(cat.id);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + t(cat.labelKey, cat.id)));
      btn.addEventListener("click", function () {
        activeCategory = cat.id;
        renderTabs();
        renderList();
      });
      root.appendChild(btn);
    });
  }

  function renderList() {
    var root = byId("vc-regole-list");
    if (!root) return;
    root.innerHTML = "";
    var list = items.filter(function (r) {
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
      h.textContent = t(r.titleKey, "");
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-question-circle";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + t(r.tagKey, "FAQ")));
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
      p.textContent = t(r.bodyKey, "");
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
  }

  function init() {
    renderTabs();
    renderList();
  }

  document.addEventListener("vc:langchange", init);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
