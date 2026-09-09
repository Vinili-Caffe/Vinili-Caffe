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
  var activeItemByCat = {};

  function faClass(iconKey) {
    var k = String(iconKey || "").trim();
    return k.indexOf("fa-") === 0 ? k : "fa-question-circle";
  }

  function revealAccordion() {
    if (typeof window.__vcRevealRegoleAccordion === "function") {
      window.__vcRevealRegoleAccordion();
    }
  }

  function itemId(r, idx) {
    return String(r.id || r.title || "item-" + idx);
  }

  function itemShort(r, idx) {
    var s = String(r.short || r.tabLabel || "").trim();
    if (s) return s;
    var title = String(r.title || "").trim();
    if (title.length <= 18) return title || itemId(r, idx);
    return title.slice(0, 16).trim() + "…";
  }

  function renderTabs() {
    var root = byId("vc-regole-tabs");
    if (!root) return;
    root.innerHTML = "";
    data.categories.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (cat.id === activeCategory ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", cat.id === activeCategory ? "true" : "false");
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

  function renderSubSwitcher(kids, activeId, onPick) {
    var track = document.createElement("div");
    track.className = "vc-regole-tabs vc-regole-tabs--sub";
    track.setAttribute("role", "tablist");
    track.setAttribute("aria-label", t("faq.subAria", "Domande"));
    kids.forEach(function (child, idx) {
      var id = itemId(child, idx);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (id === activeId ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", id === activeId ? "true" : "false");
      btn.setAttribute("data-faq-sub", id);
      var ic = document.createElement("i");
      ic.className = "fa " + faClass(child.icon);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + itemShort(child, idx)));
      btn.addEventListener("click", function () {
        onPick(id);
      });
      track.appendChild(btn);
    });
    return track;
  }

  function makePanelShell(opts) {
    var panel = document.createElement("section");
    panel.className = "vc-regole-panel vc-regole-card";
    panel.setAttribute("data-faq-card", opts.id || "");
    var head = document.createElement("div");
    head.className = "vc-regole-panel__head";
    var ico = document.createElement("span");
    ico.className = "vc-regole-card-ico";
    var ii = document.createElement("i");
    ii.className = "fa " + faClass(opts.icon);
    ii.setAttribute("aria-hidden", "true");
    ico.appendChild(ii);
    var title = document.createElement("p");
    title.className = "vc-regole-card-title";
    title.textContent = opts.title || "";
    head.appendChild(ico);
    head.appendChild(title);
    if (opts.tag) {
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-question-circle";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + opts.tag));
      head.appendChild(tag);
    }
    var body = document.createElement("div");
    body.className = "vc-regole-card-body";
    body.style.display = "block";
    var inner = document.createElement("div");
    inner.className = "vc-regole-card-body-inner";
    var lab = document.createElement("span");
    lab.className = "vc-regole-body-label";
    lab.textContent = t("faq.answer", "RISPOSTA");
    var content = document.createElement("div");
    content.className = "vc-regole-body-text";
    content.style.whiteSpace = "pre-wrap";
    content.textContent = opts.body || "";
    inner.appendChild(lab);
    inner.appendChild(content);
    body.appendChild(inner);
    panel.appendChild(head);
    panel.appendChild(body);
    return panel;
  }

  function paintItem(list, wantedId) {
    var root = byId("vc-regole-list");
    if (!root) return;
    var item = null;
    var itemIdx = 0;
    for (var i = 0; i < list.length; i++) {
      if (itemId(list[i], i) === wantedId) {
        item = list[i];
        itemIdx = i;
        break;
      }
    }
    if (!item) {
      item = list[0];
      itemIdx = 0;
    }
    if (!item) return;
    var id = itemId(item, itemIdx);
    activeItemByCat[activeCategory] = id;
    root.innerHTML = "";
    if (list.length > 1) {
      root.appendChild(
        renderSubSwitcher(list, id, function (pickId) {
          paintItem(list, pickId);
        }),
      );
    }
    var cat = data.categories.find(function (c) {
      return c.id === activeCategory;
    });
    root.appendChild(
      makePanelShell({
        id: id,
        icon: item.icon,
        title: String(item.title || ""),
        tag: String(item.tag || (cat && cat.label) || "FAQ"),
        body: String(item.body || ""),
      }),
    );
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
    var wanted = activeItemByCat[activeCategory];
    if (!wanted || !list.some(function (r, i) { return itemId(r, i) === wanted; })) {
      wanted = itemId(list[0], 0);
    }
    paintItem(list, wanted);
  }

  function init() {
    data = payload();
    if (!activeCategory && data.categories.length) activeCategory = String(data.categories[0].id);
    renderTabs();
    renderList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
