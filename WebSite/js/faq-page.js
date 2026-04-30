(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  var activeCategory = "livelli";

  var categories = [
    { id: "livelli", label: "Livelli & attività" },
    { id: "voce", label: "Voce & musica" },
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

  /** Testo statico: solo link interni /… */
  var items = [
    {
      category: "livelli",
      title: "Come posso accumulare punti EXP?",
      tag: "Livelli",
      icon: "fa-level-up",
      bodyHtml:
        "Messaggi in chat e tempo passato nelle vocali (con ActivityRank attivo) fanno salire l’EXP: niente trucchi, basta partecipare senza spam. Più sei presente in modo normale, più il livello avanza. Su <a href=\"/perks/\">Perks</a> trovi cosa si sblocca col level cap; la classifica è anche in <a href=\"/user/\">Community</a>. Comandi utili in server: <code>+rank</code> e <a href=\"/wiki/\">Wiki</a> per il resto.",
    },
    {
      category: "livelli",
      title: "Posso fare attività come minigame?",
      tag: "Livelli",
      icon: "fa-puzzle-piece",
      bodyHtml:
        "Sì. Oltre alla chat ci sono robe leggere tipo la catena del counting, reaction game e minigame dei bot nei canali dedicati: non sono obbligatori e servono per passare il tempo in chill. Apri la categoria giochi sul Discord e leggi il topic del canale prima di postare, così non combini pasticci con le regole.",
    },
    {
      category: "voce",
      title: "È possibile ascoltare musica insieme agli altri?",
      tag: "Voce",
      icon: "fa-headphones",
      bodyHtml:
        "Sì. Nelle stanze vocali puoi stare in ascolto o condividere quello che ti piace, rispettando volume e regolamento (niente earrape, niente robe che disturbino). Ci sono lounge e vocal “aperte” dove la gente si aggrega: se non sai quale usare, chiedi in chat testuale o guarda il nome del canale.",
    },
    {
      category: "giochi",
      title: "Quali giochi sono disponibili?",
      tag: "Giochi",
      icon: "fa-trophy",
      bodyHtml:
        "Dipende dai canali che hai sbloccato dopo la verifica, ma in generale trovi roba come Mudae, Poketwo, counting, ship e altri bot nei rispettivi canali. Non tutti i giochi sono per tutti i gusti: se uno non ti piace, passa oltre. Lista comandi e dettagli: <a href=\"/wiki/\">Wiki</a> e topic fissati nei canali.",
    },
    {
      category: "eventi",
      title: "Come funzionano gli eventi stagionali?",
      tag: "Eventi",
      icon: "fa-star",
      bodyHtml:
        "Ogni tanto lo staff lancia contest, giveaway o iniziative a tema (Natale, estate, collaborazioni, ecc.). Regole e scadenze stanno sempre nel messaggio annuncio o nel canale eventi/news: lì trovi come iscriverti, cosa è permesso e fino a quando vale. Se qualcosa non è scritto, chiedi nello thread o al mod di turno invece di improvvisare.",
    },
    {
      category: "eventi",
      title: "Come posso avere più possibilità di vincere gli eventi?",
      tag: "Eventi",
      icon: "fa-star",
      bodyHtml:
        "Segui alla lettera le istruzioni dell’evento (formato del messaggio, scadenza, canale giusto). Essere attivo e rispettoso aiuta perché molti contest escludono chi rompe o chi ha appena preso warn. A volte voto al server o boost danno piccoli bonus: guarda <a href=\"/vote/\">Vota</a> e <a href=\"/perks/\">Perks</a>. Non esiste una scorciatoia seria: i premi vanno a chi partecipa bene, non a chi spamma.",
    },
    {
      category: "staff",
      title: 'Cosa significa "staff pagato"?',
      tag: "Staff",
      icon: "fa-briefcase",
      bodyHtml:
        "Vuol dire che per alcuni incarichi lo staff può avere un compenso o un rimborso per il lavoro organizzativo — non è una cosa che riguarda tutti i ruoli e non è un “salario” da assumere come verità per ogni membro. I dettagli economici non si discutono in pubblico. Se ti interessa come funziona la squadra, il punto di ingresso restano le candidature quando sono aperte.",
    },
    {
      category: "staff",
      title: "Posso diventare un membro dello staff?",
      tag: "Staff",
      icon: "fa-user-plus",
      bodyHtml:
        "Sì, ma solo quando le candidature sono aperte e dopo aver letto bene regole e requisiti. Il modulo sta su <a href=\"/candidature/\">Candidature</a>: servono serietà, costanza sul server e un minimo di esperienza con la community. Manda il modulo completo e non trattare lo staff come un DM veloce per “farmi mod”. Se non sei pronto, nessun drama: resta attivo e riprova ai prossimi cicli.",
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