(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXTRAS_TABS = {
    birthday: true,
    privacy: true,
    roles: true,
    reactions: true,
    response: true,
    hogwarts: true,
  };
  var MONTHS = [
    "",
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];
  var state = { data: null, busy: false, roleCat: "pronouns" };
  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseTab() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var t = String(q.get("target") || q.get("tab") || "")
        .trim()
        .toLowerCase();
      if (t === "ruoli" || t === "rolepanel" || t === "colors" || t === "colori") return "roles";
      if (t === "mention" || t === "mention_reaction") return "reactions";
      if (t === "mention_response") return "response";
      if (EXTRAS_TABS[t]) return t;
    } catch (e) {}
    return "";
  }

  function isExtrasTab() {
    return Boolean(EXTRAS_TABS[parseTab()]);
  }

  function getToken() {
    try {
      return String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function apiUrl() {
    var c = (window.__VC_PROFILE_EXTRAS && window.__VC_PROFILE_EXTRAS.apiUrl) || "/webhooks/site-profile-extras";
    return String(c || "").trim() || "/webhooks/site-profile-extras";
  }

  function showToast(message, isError) {
    var host = byId("vc-custom-profile-toast-host") || byId("vc-profile-extras-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vc-profile-extras-toast-host";
      host.className = "vc-cpf-toast-host";
      document.body.appendChild(host);
    }
    host.innerHTML = '<div class="vc-cpf-toast' + (isError ? " is-error" : "") + '">' + esc(message || "") + "</div>";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      host.innerHTML = "";
    }, 3200);
  }

  function fetchOpts(extra) {
    var opts = Object.assign({ headers: {} }, extra || {});
    try {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        opts.signal = AbortSignal.timeout(25000);
      }
    } catch (eTimeout) {}
    return opts;
  }

  async function apiGet() {
    var token = getToken();
    if (!token) return { ok: false, error: "missing_token", message: "Accedi con Discord." };
    var res = await fetch(
      apiUrl(),
      fetchOpts({ headers: { Accept: "application/json", Authorization: "Bearer " + token } }),
    );
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (data && typeof data === "object") data.status = res.status;
    return data || { ok: false, status: res.status, message: "Risposta non valida." };
  }

  async function apiPost(body) {
    var token = getToken();
    if (!token) return { ok: false, error: "missing_token", message: "Accedi con Discord." };
    var res = await fetch(
      apiUrl(),
      fetchOpts({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body || {}),
      }),
    );
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (data && typeof data === "object") data.status = res.status;
    return data || { ok: false, status: res.status, message: "Risposta non valida." };
  }

  function killLoaders() {
    try {
      document.documentElement.classList.remove("vc-custom-profile-pending");
      document.documentElement.classList.remove("vc-rank-customize-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready");
      document.documentElement.classList.add("vc-pers-extras-ready");
      document.body.classList.add("vc-custom-profile-page");
    } catch (e) {}
    try {
      var nodes = document.querySelectorAll(
        '#vc-custom-profile-loading, #vc-rank-customize-loading, [data-vc-profile-boot], .vc-user-profile-loader.vc-user-profile-boot',
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        el.hidden = true;
        el.setAttribute("hidden", "");
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e2) {}
  }

  function shell(inner) {
    return '<div class="vc-cpf vc-profile-extras">' + inner + "</div>";
  }

  function stageCard(icon, title, meta) {
    return (
      '<aside class="vc-cpf-stage" aria-label="Anteprima">' +
      '<div class="vc-cpf-stage__card">' +
      '<span class="vc-cpf-stage__mark"><i class="fa ' +
      esc(icon || "fa-sliders") +
      '" aria-hidden="true"></i></span>' +
      '<p class="vc-cpf-stage__title">' +
      esc(title || "") +
      "</p>" +
      '<p class="vc-cpf-stage__meta">' +
      esc(meta || "") +
      "</p>" +
      "</div></aside>"
    );
  }

  function editor(blocksHtml) {
    return '<div class="vc-cpf-editor">' + blocksHtml + "</div>";
  }

  function blockBody(inner) {
    return '<section class="vc-cpf-block"><div class="vc-cpf-block__body">' + inner + "</div></section>";
  }

  function actions(html) {
    return '<div class="vc-cpf-actions">' + html + "</div>";
  }

  function btn(primary, ghost, danger, label, px) {
    var cls = "vc-cpf-btn";
    if (primary) cls += " vc-cpf-btn--primary";
    else if (danger) cls += " vc-cpf-btn--danger";
    else if (ghost) cls += " vc-cpf-btn--ghost";
    return (
      '<button type="button" class="' +
      cls +
      '" data-px="' +
      esc(px) +
      '">' +
      esc(label) +
      "</button>"
    );
  }

  function layout(stage, blocks) {
    return '<div class="vc-cpf-layout">' + stage + editor(blocks) + "</div>";
  }

  function titleFor(tab) {
    if (tab === "birthday") return "Compleanno";
    if (tab === "privacy") return "Privacy";
    if (tab === "roles") return "Ruoli";
    if (tab === "reactions") return "Reactions";
    if (tab === "response") return "Response";
    if (tab === "hogwarts") return "Hogwarts";
    return "Personalizza";
  }

  function renderBirthday() {
    var b = (state.data && state.data.birthday) || {};
    var day = Number(b.day) || 0;
    var month = Number(b.month) || 0;
    var summary =
      day && month ? day + " " + (MONTHS[month] || month) : "Nessuna data impostata";
    var ageMeta = b.showAge === false ? "Età nascosta sul profilo" : "Età visibile sul profilo";
    var monthOpts = '<option value="">Seleziona mese</option>';
    for (var m = 1; m <= 12; m++) {
      monthOpts +=
        '<option value="' +
        m +
        '"' +
        (month === m ? " selected" : "") +
        ">" +
        esc(MONTHS[m]) +
        "</option>";
    }
    return layout(
      stageCard("fa-birthday-cake", summary, ageMeta),
      blockBody(
        '<div class="vc-cpf-grid">' +
          '<label class="vc-cpf-field"><span>Giorno</span><input id="vc-px-bday-day" type="number" min="1" max="31" inputmode="numeric" value="' +
          esc(day || "") +
          '" /></label>' +
          '<label class="vc-cpf-field"><span>Mese</span><select id="vc-px-bday-month">' +
          monthOpts +
          "</select></label>" +
          '<label class="vc-cpf-field"><span>Età</span><input id="vc-px-bday-age" type="number" min="1" max="120" inputmode="numeric" placeholder="opzionale" value="" /></label>' +
          "</div>" +
          actions(
            btn(true, false, false, "Salva", "birthday-save") +
              btn(false, true, false, b.showAge === false ? "Mostra età" : "Nascondi età", "birthday-privacy") +
              btn(false, false, true, "Rimuovi", "birthday-clear"),
          ),
      ),
    );
  }

  function renderPrivacy() {
    var kinds = (state.data && state.data.privacy && state.data.privacy.kinds) || [];
    var visible = 0;
    for (var i = 0; i < kinds.length; i++) if (!kinds[i].blocked) visible += 1;
    var rows = kinds
      .map(function (k) {
        return (
          '<button type="button" class="vc-profile-extras__toggle' +
          (k.blocked ? " is-off" : " is-on") +
          '" data-px="privacy-toggle" data-key="' +
          esc(k.key) +
          '"><span>' +
          esc(k.label) +
          "</span><strong>" +
          (k.blocked ? "Bloccato" : "Visibile") +
          "</strong></button>"
        );
      })
      .join("");
    return layout(
      stageCard("fa-lock", "Privacy profilo", visible + "/" + kinds.length + " elementi visibili"),
      blockBody(
        '<div class="vc-profile-extras__toggles">' +
          (rows || '<p class="vc-cpf-empty">Nessuna opzione privacy.</p>') +
          "</div>" +
          actions(
            btn(true, false, false, "Tutto visibile", "privacy-all-on") +
              btn(false, true, false, "Tutto bloccato", "privacy-all-off"),
          ),
      ),
    );
  }

  function renderRoles() {
    var panelData = (state.data && state.data.rolePanel) || {};
    var cats = panelData.categories || [];
    var byKey = panelData.byKey || {};
    var cat = state.roleCat || "pronouns";
    if (!byKey[cat] && cats[0]) cat = cats[0].key;
    state.roleCat = cat;
    var current = byKey[cat] || { options: [] };
    var selected = String(current.selected || "");
    var catLabel = current.label || (cats.find(function (c) { return c.key === cat; }) || {}).label || "Ruoli";
    var selectedLabel = "Nessuna selezione";
    var options = Array.isArray(current.options) ? current.options : [];
    for (var i = 0; i < options.length; i++) {
      if (String(options[i].value) === selected && selected && selected !== "remove") {
        selectedLabel = options[i].label || selected;
        break;
      }
    }
    var catBtns = cats
      .map(function (c) {
        return (
          '<button type="button" class="vc-profile-extras__chip' +
          (c.key === cat ? " is-active" : "") +
          '" data-px="role-cat" data-key="' +
          esc(c.key) +
          '">' +
          esc(c.label) +
          "</button>"
        );
      })
      .join("");
    var rows = options
      .map(function (o) {
        var val = String(o.value || "");
        var isSel = selected && selected === val;
        return (
          '<button type="button" class="vc-profile-extras__option' +
          (isSel ? " is-selected" : "") +
          (val === "remove" ? " is-remove" : "") +
          '" data-px="role-pick" data-value="' +
          esc(val) +
          '"><span class="vc-profile-extras__option-label">' +
          esc(o.label || val) +
          '</span><span class="vc-profile-extras__option-mark" aria-hidden="true">' +
          (isSel ? '<i class="fa fa-check"></i>' : "") +
          "</span></button>"
        );
      })
      .join("");
    return layout(
      stageCard("fa-tags", catLabel, selectedLabel),
      blockBody(
        '<div class="vc-profile-extras__chips">' +
          catBtns +
          "</div>" +
          '<div class="vc-profile-extras__options" role="listbox">' +
          (rows || '<p class="vc-cpf-empty">Nessuna opzione in questa categoria.</p>') +
          "</div>" +
          '<p class="vc-profile-extras__hint">Il tocco applica subito il ruolo su Discord.</p>',
      ),
    );
  }

  function renderReactions() {
    var r = (state.data && state.data.mentionReaction) || {};
    if (!r.access) {
      return layout(
        stageCard("fa-smile-o", "Reactions", "Accesso mancante"),
        blockBody('<p class="vc-cpf-empty">Serve VIP, Booster, Double Booster, VIP+ o Level 70.</p>'),
      );
    }
    var preview = r.display && r.display.length ? r.display.join(" ") : "Nessuna reaction attiva";
    return layout(
      stageCard("fa-smile-o", "Mention Reactions", preview),
      blockBody(
        '<label class="vc-cpf-field"><span>Emoji / reaction (max ' +
          esc(String(r.max || 3)) +
          ")</span>" +
          '<div class="vc-cpf-inputrow"><input id="vc-px-reactions" type="text" placeholder="es. 🔥 🙂 oppure <:nome:id>" value="" autocomplete="off" /></div></label>' +
          actions(
            btn(true, false, false, "Salva", "reactions-save") +
              btn(false, true, false, "Rimuovi", "reactions-clear"),
          ),
      ),
    );
  }

  function renderResponse() {
    var r = (state.data && state.data.mentionResponse) || {};
    if (!r.access) {
      return layout(
        stageCard("fa-commenting-o", "Response", "Accesso mancante"),
        blockBody('<p class="vc-cpf-empty">' + esc(r.accessHint || "Funzione riservata.") + "</p>"),
      );
    }
    var preview = String(r.text || "").trim();
    return layout(
      stageCard("fa-commenting-o", "Mention Response", preview ? preview.slice(0, 80) : "Nessun testo attivo"),
      blockBody(
        '<label class="vc-cpf-field"><span>Messaggio (max 500)</span>' +
          '<textarea id="vc-px-response" rows="5" maxlength="500" placeholder="Testo ed emoji…">' +
          esc(r.text || "") +
          "</textarea></label>" +
          actions(
            btn(true, false, false, "Salva", "response-save") +
              btn(false, true, false, "Rimuovi", "response-clear"),
          ),
      ),
    );
  }

  function renderHogwarts() {
    var h = (state.data && state.data.hogwarts) || {};
    if (!h.enabled) {
      return layout(
        stageCard("fa-magic", "Hogwarts", "Evento non attivo"),
        blockBody('<p class="vc-cpf-empty">Torna quando l’evento è online.</p>'),
      );
    }
    var s = h.summary || {};
    var house = s.houseLabel || s.house || "Non smistato";
    var metaBits = [];
    if (s.galeoni != null) metaBits.push("Galeoni " + s.galeoni);
    if (s.points != null) metaBits.push("Punti " + s.points);
    return layout(
      stageCard("fa-magic", house, metaBits.join(" · ") || "Progressi evento"),
      blockBody(
        actions(
          '<a class="vc-cpf-btn vc-cpf-btn--primary" href="' +
            esc(h.sortingUrl || "/evento/smistamento/") +
            '">Apri smistamento</a>',
        ),
      ),
    );
  }

  function render() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    var tab = parseTab();
    var body = "";
    if (tab === "birthday") body = renderBirthday();
    else if (tab === "privacy") body = renderPrivacy();
    else if (tab === "roles") body = renderRoles();
    else if (tab === "reactions") body = renderReactions();
    else if (tab === "response") body = renderResponse();
    else if (tab === "hogwarts") body = renderHogwarts();
    app.hidden = false;
    app.dataset.vcCpfReady = "1";
    app.classList.toggle("is-busy", Boolean(state.busy));
    app.innerHTML = shell(body);
    try {
      document.title = "Vinili & Caffè | " + titleFor(tab);
    } catch (e) {}
    wire();
    killLoaders();
  }

  async function run(section, extra) {
    if (state.busy) return;
    state.busy = true;
    var app = byId("vc-custom-profile-app");
    if (app) app.classList.add("is-busy");
    try {
      var out = await apiPost(Object.assign({ section: section }, extra || {}));
      if (!out || !out.ok) {
        showToast((out && out.message) || "Operazione non riuscita.", true);
        return;
      }
      if (out.dm) state.data.dm = out.dm;
      if (out.privacy) state.data.privacy = out.privacy;
      if (out.birthday) state.data.birthday = out.birthday;
      if (out.mentionReaction) state.data.mentionReaction = out.mentionReaction;
      if (out.mentionResponse) {
        state.data.mentionResponse = Object.assign({}, state.data.mentionResponse || {}, out.mentionResponse);
      }
      if (out.rolePanelCategory && state.data.rolePanel && state.data.rolePanel.byKey) {
        state.data.rolePanel.byKey[out.rolePanelCategory.key] = out.rolePanelCategory;
      }
      showToast(out.message || "Salvato.");
      render();
    } catch (e) {
      showToast("Errore di rete.", true);
    } finally {
      state.busy = false;
      if (app) app.classList.remove("is-busy");
    }
  }

  function wire() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    app.onclick = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-px]") : null;
      if (!btn) return;
      ev.preventDefault();
      var act = String(btn.getAttribute("data-px") || "");
      if (act === "birthday-save") {
        return run("birthday", {
          action: "set",
          day: Number((byId("vc-px-bday-day") || {}).value),
          month: Number((byId("vc-px-bday-month") || {}).value),
          age: Number((byId("vc-px-bday-age") || {}).value),
        });
      }
      if (act === "birthday-clear") return run("birthday", { action: "clear" });
      if (act === "birthday-privacy") {
        var cur = state.data && state.data.birthday;
        return run("birthday", { action: "privacy", showAge: Boolean(cur && cur.showAge === false) });
      }
      if (act === "privacy-toggle") return run("privacy", { action: "toggle", key: btn.getAttribute("data-key") });
      if (act === "privacy-all-on") return run("privacy", { action: "all_on" });
      if (act === "privacy-all-off") return run("privacy", { action: "all_off" });
      if (act === "role-cat") {
        state.roleCat = String(btn.getAttribute("data-key") || "pronouns");
        render();
        return;
      }
      if (act === "role-pick") {
        return run("roles", {
          category: state.roleCat,
          value: String(btn.getAttribute("data-value") || ""),
        });
      }
      if (act === "reactions-save") {
        var inp = byId("vc-px-reactions");
        return run("mention_reaction", { action: "set", value: inp ? inp.value : "" });
      }
      if (act === "reactions-clear") return run("mention_reaction", { action: "clear" });
      if (act === "response-save") {
        var ta = byId("vc-px-response");
        return run("mention_response", { action: "set", text: ta ? ta.value : "" });
      }
      if (act === "response-clear") return run("mention_response", { action: "clear" });
    };
  }

  async function boot() {
    if (!isExtrasTab()) return;
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    killLoaders();
    app.hidden = false;
    app.innerHTML = shell(
      '<div class="vc-cpf-layout is-single"><div class="vc-cpf-editor">' +
        blockBody('<p class="vc-cpf-empty">Caricamento impostazioni…</p>') +
        "</div></div>",
    );
    if (!getToken()) {
      app.innerHTML = shell(
        '<div class="vc-cpf-layout is-single"><div class="vc-cpf-editor">' +
          blockBody('<p class="vc-cpf-empty">Accedi con Discord per gestire queste impostazioni.</p>') +
          "</div></div>",
      );
      killLoaders();
      return;
    }
    try {
      var data = await apiGet();
      if (!data || !data.ok) {
        app.innerHTML = shell(
          '<div class="vc-cpf-layout is-single"><div class="vc-cpf-editor">' +
            blockBody('<p class="vc-cpf-empty">' + esc((data && data.message) || "Impossibile caricare.") + "</p>") +
            "</div></div>",
        );
        killLoaders();
        return;
      }
      state.data = data;
      render();
    } catch (e) {
      app.innerHTML = shell(
        '<div class="vc-cpf-layout is-single"><div class="vc-cpf-editor">' +
          blockBody('<p class="vc-cpf-empty">Errore di rete o timeout. Ricarica la pagina.</p>') +
          "</div></div>",
      );
      killLoaders();
    }
  }

  window.__VC_PROFILE_EXTRAS_API = { isExtrasTab: isExtrasTab, boot: boot, parseTab: parseTab };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
