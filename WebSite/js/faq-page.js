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
  var activeItemByCat = {};

  var categories = [
    { id: "livelli", labelKey: "faq.cat.livelli", fallback: "Livelli" },
    { id: "voce", labelKey: "faq.cat.voce", fallback: "Musica" },
    { id: "giochi", labelKey: "faq.cat.giochi", fallback: "Giochi" },
    { id: "eventi", labelKey: "faq.cat.eventi", fallback: "Eventi" },
    { id: "staff", labelKey: "faq.cat.staff", fallback: "Staff" },
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

  /* IT fallbacks required: /faq does not load vc-i18n.js (only short had inline fallbacks before). */
  var items = [
    {
      id: "q1",
      category: "livelli",
      shortKey: "faq.q1.short",
      short: "EXP",
      titleKey: "faq.q1.title",
      title: "Come posso accumulare punti EXP?",
      tagKey: "faq.tag.livelli",
      icon: "fa-level-up",
      bodyKey: "faq.q1.body",
      body: "Ogni messaggio in chat e il tempo passato nelle vocali fanno salire l’EXP (in vocale l'esperienza guadagnata è il doppio). Su PERKS trovi cosa si sblocca con i vari livelli mentre le classifiche sono visibili in COMMUNITY.",
    },
    {
      id: "q2",
      category: "livelli",
      shortKey: "faq.q2.short",
      short: "Minigames",
      titleKey: "faq.q2.title",
      title: "Come posso partecipare ai minigames?",
      tagKey: "faq.tag.livelli",
      icon: "fa-puzzle-piece",
      bodyKey: "faq.q2.body",
      body: "Ogni 15 minuti, dalle 8 di mattina fino alle 23:59, potrai divertiti con piccoli giochi in chat che il nostro bot invierà. Non sono obbligatori ma se vuoi divertirti in compagnia concorrendo con gli altri utenti e guadagnare EXP aggiuntiva, questo è quello che fa per te!",
    },
    {
      id: "q3",
      category: "voce",
      shortKey: "faq.q3.short",
      short: "Musica",
      titleKey: "faq.q3.title",
      title: "È possibile ascoltare musica insieme agli altri?",
      tagKey: "faq.tag.voce",
      icon: "fa-headphones",
      bodyKey: "faq.q3.body",
      body: "Certamente! Nelle stanze vocali puoi stare in ascolto o condividere quello che ti piace, rispettando volume e regolamento (niente earrape, niente robe che disturbino), con tramite i nostri bot ufficiali! Se vuoi scoprire tutti i comandi, corri in WIKI.",
    },
    {
      id: "q4",
      category: "giochi",
      shortKey: "faq.q4.short",
      short: "Giochi",
      titleKey: "faq.q4.title",
      title: "Quali giochi sono disponibili?",
      tagKey: "faq.tag.giochi",
      icon: "fa-trophy",
      bodyKey: "faq.q4.body",
      body: "Ci sono molti canali come Pokétwo, Counting, Ship nei rispettivi canali oltre i minigames in chat col bot. Non tutti i giochi sono per tutti i gusti: se uno non ti piace, passa oltre.",
    },
    {
      id: "q5",
      category: "eventi",
      shortKey: "faq.q5.short",
      short: "Season",
      titleKey: "faq.q5.title",
      title: "Come funzionano gli eventi stagionali?",
      tagKey: "faq.tag.eventi",
      icon: "fa-star",
      bodyKey: "faq.q5.body",
      body: "Durante la tua permanenza nel server, potrai partecipare a delle vere e proprie SEASON dalla durata di circa 3 mesi. Ognuno di questi periodi propone un tema principale attorno al quale si terranno numerosi eventi, contest e sfide così belli da tenerti incollato allo schermo!",
    },
    {
      id: "q6",
      category: "eventi",
      shortKey: "faq.q6.short",
      short: "Vincere",
      titleKey: "faq.q6.title",
      title: "Come posso avere più possibilità di vincere gli eventi?",
      tagKey: "faq.tag.eventi",
      icon: "fa-star",
      bodyKey: "faq.q6.body",
      body: "Segui alla lettera le istruzioni dell’evento perché sicuramente ci saranno scritti tutti i modi per poterti avvantaggiare. In linea generale, essere attivo in vocale e in testuale aiuta molto. Se vuoi dei bonus, solitamente votando il server e boostandolo riceverai i vantaggi elencati in VOTA e PERKS. Non esiste una scorciatoia unica: i premi vanno a chi partecipa con costanza ed entusiasmo!",
    },
    {
      id: "q7",
      category: "staff",
      shortKey: "faq.q7.short",
      short: "Premi",
      titleKey: "faq.q7.title",
      title: "Cosa significa \"staff pagato\"?",
      tagKey: "faq.tag.staff",
      icon: "fa-briefcase",
      bodyKey: "faq.q7.body",
      body: "Ogni mese verrà premiato il migliore tra tutto lo Staff a cui verrà regalato Nitro Boost per un mese. I Partner Manager, invece, vengono premiati con un Nitro Boost e premi in denaro in base al proprio operato.",
    },
    {
      id: "q8",
      category: "staff",
      shortKey: "faq.q8.short",
      short: "Candidatura",
      titleKey: "faq.q8.title",
      title: "Posso diventare un membro dello staff?",
      tagKey: "faq.tag.staff",
      icon: "fa-user-plus",
      bodyKey: "faq.q8.body",
      body: "Ovviamente! Siamo sempre alla ricerca di nuove figure da inserire nella nostra grande famiglia. Dopo aver letto bene regole, puoi inviare la tua candidatura tramite il modulo che trovi in questa pagina. Ricorda: serietà e costanza sono fondamentali! Se la tua candidatura è accompagnata da esperienza, non esitare a renderlo noto! Dopo l’invio è importante non taggare i membri dello staff o aprire ticket per chiedere l'esito della tua candidatura.",
    },
  ];

  function faClass(iconKey) {
    var k = String(iconKey || "").trim();
    return k.indexOf("fa-") === 0 ? k : "fa-question-circle";
  }

  function revealAccordion() {
    if (typeof window.__vcRevealRegoleAccordion === "function") {
      window.__vcRevealRegoleAccordion();
    }
  }

  function itemShort(r) {
    return t(r.shortKey, r.short || r.id);
  }

  function renderTabs() {
    var root = byId("vc-regole-tabs");
    if (!root) return;
    root.innerHTML = "";
    categories.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (cat.id === activeCategory ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", cat.id === activeCategory ? "true" : "false");
      btn.setAttribute("data-cat", cat.id);
      var ic = document.createElement("i");
      ic.className = "fa " + tabIcon(cat.id);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + t(cat.labelKey, cat.fallback || cat.id)));
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
    kids.forEach(function (child) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (child.id === activeId ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", child.id === activeId ? "true" : "false");
      btn.setAttribute("data-faq-sub", child.id);
      var ic = document.createElement("i");
      ic.className = "fa " + faClass(child.icon);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + itemShort(child)));
      btn.addEventListener("click", function () {
        onPick(child.id);
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
    content.textContent = opts.body || "";
    inner.appendChild(lab);
    inner.appendChild(content);
    body.appendChild(inner);
    panel.appendChild(head);
    panel.appendChild(body);
    return panel;
  }

  function paintItem(list, itemId) {
    var root = byId("vc-regole-list");
    if (!root) return;
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === itemId) {
        item = list[i];
        break;
      }
    }
    if (!item) item = list[0];
    if (!item) return;
    activeItemByCat[activeCategory] = item.id;
    root.innerHTML = "";
    if (list.length > 1) {
      root.appendChild(
        renderSubSwitcher(list, item.id, function (id) {
          paintItem(list, id);
        }),
      );
    }
    var cat = categories.find(function (c) {
      return c.id === activeCategory;
    });
    root.appendChild(
      makePanelShell({
        id: item.id,
        icon: item.icon,
        title: t(item.titleKey, item.title || ""),
        tag: t(item.tagKey, cat ? cat.fallback : "FAQ"),
        body: t(item.bodyKey, item.body || ""),
      }),
    );
    revealAccordion();
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
    var wanted = activeItemByCat[activeCategory];
    if (!wanted || !list.some(function (r) { return r.id === wanted; })) {
      wanted = list[0].id;
    }
    paintItem(list, wanted);
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
