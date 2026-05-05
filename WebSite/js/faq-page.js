(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  var activeCategory = "livelli";

  var categories = [
    { id: "livelli", label: "Livelli" },
    { id: "voce", label: "Musica" },
    { id: "giochi", label: "Giochi" },
    { id: "eventi", label: "Eventi" },
    { id: "staff", label: "Staff" },
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
    {
      category: "livelli",
      title: "Come posso accumulare punti EXP?",
      tag: "Livelli",
      icon: "fa-level-up",
      bodyHtml:
        "Ogni messaggio in chat e il tempo passato nelle vocali fanno salire l’EXP (in vocale l'esperienza guadagnata è il doppio). Su PERKS trovi cosa si sblocca con i vari livelli mentre le classifiche sono visibili in COMMUNITY.",
    },
    {
      category: "livelli",
      title: "Come posso partecipare ai minigames?",
      tag: "Livelli",
      icon: "fa-puzzle-piece",
      bodyHtml:
        "Ogni 15 minuti, dalle 8 di mattina fino alle 23:59, potrai divertiti con piccoli giochi in chat che il nostro bot invierà. Non sono obbligatori ma se vuoi divertirti in compagnia concorrendo con gli altri utenti e guadagnare EXP aggiuntiva, questo è quello che fa per te!",
    },
    {
      category: "voce",
      title: "È possibile ascoltare musica insieme agli altri?",
      tag: "Voce",
      icon: "fa-headphones",
      bodyHtml:
        "Certamente! Nelle stanze vocali puoi stare in ascolto o condividere quello che ti piace, rispettando volume e regolamento (niente earrape, niente robe che disturbino), con tramite i nostri bot ufficiali! Se vuoi scoprire tutti i comandi, corri in WIKI.",
    },
    {
      category: "giochi",
      title: "Quali giochi sono disponibili?",
      tag: "Giochi",
      icon: "fa-trophy",
      bodyHtml:
        "Ci sono molti canali come Mudae, Pokétwo, Counting, Ship nei rispettivi canali oltre i minigames in chat col bot . Non tutti i giochi sono per tutti i gusti: se uno non ti piace, passa oltre.",
    },
    {
      category: "eventi",
      title: "Come funzionano gli eventi stagionali?",
      tag: "Eventi",
      icon: "fa-star",
      bodyHtml:
        "Durante la tua permanenza nel server, potrai partecipare a delle vere e proprie SEASON dalla durata di circa 3 mesi. Ognuno di questi periodi propone un tema principale attorno al quale si terranno numerosi eventi, contest e sfide così belli da tenerti incollato allo schermo!",
    },
    {
      category: "eventi",
      title: "Come posso avere più possibilità di vincere gli eventi?",
      tag: "Eventi",
      icon: "fa-star",
      bodyHtml:
        "Segui alla lettera le istruzioni dell’evento perché sicuramente ci saranno scritti tutti i modi per poterti avvantaggiare. In linea generale, essere attivo in vocale e in testuale aiuta molto. Se vuoi dei bonus, solitamente votando il server e boostandolo riceverai i vantaggi elencati in VOTA e PERKS. Non esiste una scorciatoia unica: i premi vanno a chi partecipa con costanza ed entusiasmo!",
    },
    {
      category: "staff",
      title: 'Cosa significa "staff pagato"?',
      tag: "Staff",
      icon: "fa-briefcase",
      bodyHtml:
        "Ogni mese verrà premiato il migliore tra tutto lo Staff a cui verrà regalato Nitro Boost per un mese. I Partner Manager, invece, vengono premiati con un Nitro Boost e premi in denaro in base al proprio operato.",
    },
    {
      category: "staff",
      title: "Posso diventare un membro dello staff?",
      tag: "Staff",
      icon: "fa-user-plus",
      bodyHtml:
        "Ovviamente! Siamo sempre alla ricerca di nuove figure da inserire nella nostra grande famiglia. Dopo aver letto bene regole, puoi inviare la tua candidatura tramite il modulo che trovi in questa pagina. Ricorda: serietà e costanza sono fondamentali! Se la tua candidatura è accompagnata da esperienza, non esitare a renderlo noto! Dopo l’invio è importante non taggare i membri dello staff o aprire ticket per chiedere l'esito della tua candidatura.",
    },
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
      btn.appendChild(document.createTextNode(" " + String(cat.label || cat.id)));
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
      empty.textContent = "Nessuna domanda in questa categoria.";
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
      lab.textContent = "RISPOSTA";
      var p = document.createElement("div");
      p.className = "vc-regole-body-text";
      p.innerHTML = String(r.bodyHtml || "");
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();