/**
 * Modal conferma / alert / scelta / prompt condiviso.
 * API:
 *   VcDialog.confirm({ title, message, confirmLabel, cancelLabel, danger, icon }) → Promise<boolean>
 *   VcDialog.alert({ title, message, okLabel, danger, icon }) → Promise<void>
 *   VcDialog.choose({ title, message, choices:[{id,label,danger}], cancelLabel, icon }) → Promise<string|null>
 *   VcDialog.prompt({ title, message, label, placeholder, defaultValue, confirmLabel, cancelLabel, danger, icon, maxLength }) → Promise<string|null>
 */
(function (global) {
  "use strict";

  var ROOT_ID = "vc-site-dialog";
  var pending = null;
  var keyHandler = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function defaultIcon(kind, danger) {
    if (kind === "alert") return danger ? "fa-exclamation-triangle" : "fa-info-circle";
    if (kind === "choose") return danger ? "fa-exclamation-triangle" : "fa-question-circle";
    if (kind === "prompt") return danger ? "fa-times-circle" : "fa-pencil";
    return danger ? "fa-trash-o" : "fa-question-circle";
  }

  function ensureRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "vc-dialog";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<button type="button" class="vc-dialog__backdrop" data-vc-dialog="cancel" aria-label="Chiudi"></button>' +
      '<div class="vc-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="vc-dialog-title">' +
      '<div class="vc-dialog__icon" id="vc-dialog-icon" aria-hidden="true"><i class="fa fa-question-circle"></i></div>' +
      '<h3 class="vc-dialog__title" id="vc-dialog-title"></h3>' +
      '<div class="vc-dialog__text" id="vc-dialog-text"></div>' +
      '<div class="vc-dialog__field" id="vc-dialog-field" hidden>' +
      '<label class="vc-dialog__label" id="vc-dialog-label" for="vc-dialog-input"></label>' +
      '<input class="vc-dialog__input" id="vc-dialog-input" type="text" autocomplete="off" />' +
      '<textarea class="vc-dialog__input vc-dialog__textarea" id="vc-dialog-textarea" hidden rows="6"></textarea>' +
      "</div>" +
      '<div class="vc-dialog__actions" id="vc-dialog-actions"></div>' +
      "</div>";
    document.body.appendChild(root);
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-dialog]") : null;
      if (!btn || !pending) return;
      var action = btn.getAttribute("data-vc-dialog");
      if (action === "cancel") {
        finish(null);
        return;
      }
      if (action === "ok") {
        if (pending.kind === "prompt") {
          var multiline = pending.multiline === true;
          var field = document.getElementById(multiline ? "vc-dialog-textarea" : "vc-dialog-input");
          finish(field ? String(field.value || "") : "");
          return;
        }
        finish(true);
        return;
      }
      if (action === "choice") {
        finish(btn.getAttribute("data-vc-dialog-choice") || null);
      }
    });
    return root;
  }

  function detachKey() {
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler, true);
      keyHandler = null;
    }
  }

  function finish(value) {
    var root = document.getElementById(ROOT_ID);
    detachKey();
    if (root) {
      root.classList.remove("is-open");
      root.setAttribute("hidden", "");
    }
    try {
      document.documentElement.classList.remove("vc-dialog-open");
    } catch (eCls) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      else if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    var resolve = pending && pending.resolve;
    var kind = pending && pending.kind;
    pending = null;
    if (typeof resolve !== "function") return;
    if (kind === "confirm") resolve(value === true);
    else if (kind === "alert") resolve(true);
    else if (kind === "prompt") resolve(value == null ? null : String(value));
    else resolve(value == null || value === false ? null : value);
  }

  function openDialog(opts) {
    opts = opts || {};
    var kind =
      opts.kind === "alert"
        ? "alert"
        : opts.kind === "choose"
          ? "choose"
          : opts.kind === "prompt"
            ? "prompt"
            : "confirm";
    var danger = opts.danger === true;
    var title = String(opts.title || (kind === "alert" ? "Avviso" : kind === "prompt" ? "Inserisci" : "Conferma")).trim();
    var message = String(opts.message || "").trim();
    var htmlMessage = opts.htmlMessage ? String(opts.htmlMessage) : "";
    var confirmLabel = String(
      opts.confirmLabel || opts.okLabel || (kind === "alert" ? "OK" : kind === "prompt" ? "Conferma" : "Conferma"),
    ).trim();
    var cancelLabel = String(opts.cancelLabel || "Annulla").trim();
    var iconClass = String(opts.icon || defaultIcon(kind, danger)).replace(/^fa\s+/, "");
    var choices = Array.isArray(opts.choices) ? opts.choices : [];
    var fieldLabel = String(opts.label || opts.inputLabel || "").trim();
    var placeholder = String(opts.placeholder || "").trim();
    var defaultValue = String(opts.defaultValue != null ? opts.defaultValue : opts.value != null ? opts.value : "");
    var maxLength = Number(opts.maxLength);
    if (!Number.isFinite(maxLength) || maxLength < 1) maxLength = 500;
    var multiline = opts.multiline === true;

    return new Promise(function (resolve) {
      if (pending) finish(kind === "confirm" ? false : null);
      pending = { resolve: resolve, kind: kind, multiline: multiline };
      var root = ensureRoot();
      var titleEl = document.getElementById("vc-dialog-title");
      var textEl = document.getElementById("vc-dialog-text");
      var iconWrap = document.getElementById("vc-dialog-icon");
      var actions = document.getElementById("vc-dialog-actions");
      var fieldWrap = document.getElementById("vc-dialog-field");
      var labelEl = document.getElementById("vc-dialog-label");
      var inputEl = document.getElementById("vc-dialog-input");
      var areaEl = document.getElementById("vc-dialog-textarea");
      if (titleEl) titleEl.textContent = title;
      if (textEl) {
        if (htmlMessage) textEl.innerHTML = htmlMessage;
        else textEl.textContent = message;
        textEl.hidden = !(htmlMessage || message);
      }
      if (iconWrap) {
        iconWrap.className = "vc-dialog__icon" + (danger ? " is-danger" : " is-info");
        iconWrap.innerHTML = '<i class="fa ' + esc(iconClass) + '"></i>';
      }
      if (fieldWrap && labelEl && inputEl) {
        if (kind === "prompt") {
          fieldWrap.hidden = false;
          labelEl.textContent = fieldLabel || "Motivo";
          labelEl.hidden = !fieldLabel;
          labelEl.setAttribute("for", multiline ? "vc-dialog-textarea" : "vc-dialog-input");
          inputEl.hidden = multiline;
          if (areaEl) {
            areaEl.hidden = !multiline;
            areaEl.value = defaultValue;
            areaEl.placeholder = placeholder;
            areaEl.maxLength = maxLength;
          }
          inputEl.value = multiline ? "" : defaultValue;
          inputEl.placeholder = placeholder;
          inputEl.maxLength = maxLength;
        } else {
          fieldWrap.hidden = true;
          inputEl.value = "";
          inputEl.hidden = false;
          if (areaEl) {
            areaEl.hidden = true;
            areaEl.value = "";
          }
        }
      }
      if (actions) {
        if (kind === "alert") {
          actions.className = "vc-dialog__actions";
          actions.innerHTML =
            '<button type="button" class="vc-dialog__btn vc-dialog__btn--primary" data-vc-dialog="ok">' +
            esc(confirmLabel) +
            "</button>";
        } else if (kind === "choose") {
          actions.className = "vc-dialog__actions vc-dialog__actions--stack";
          var html =
            '<button type="button" class="vc-dialog__btn" data-vc-dialog="cancel">' +
            esc(cancelLabel) +
            "</button>";
          for (var i = 0; i < choices.length; i += 1) {
            var ch = choices[i] || {};
            var id = String(ch.id || "").trim();
            if (!id) continue;
            var label = String(ch.label || id).trim();
            var chDanger = ch.danger === true;
            html +=
              '<button type="button" class="vc-dialog__btn ' +
              (chDanger ? "vc-dialog__btn--danger" : "vc-dialog__btn--primary") +
              '" data-vc-dialog="choice" data-vc-dialog-choice="' +
              esc(id) +
              '">' +
              esc(label) +
              "</button>";
          }
          actions.innerHTML = html;
        } else {
          actions.className = "vc-dialog__actions";
          actions.innerHTML =
            '<button type="button" class="vc-dialog__btn" data-vc-dialog="cancel">' +
            esc(cancelLabel) +
            "</button>" +
            '<button type="button" class="vc-dialog__btn ' +
            (danger ? "vc-dialog__btn--danger" : "vc-dialog__btn--primary") +
            '" data-vc-dialog="ok">' +
            esc(confirmLabel) +
            "</button>";
        }
      }
      keyHandler = function (ev) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          finish(kind === "alert" ? true : kind === "confirm" ? false : null);
        } else if (ev.key === "Enter") {
          if (kind === "alert") {
            ev.preventDefault();
            finish(true);
          } else if (kind === "prompt") {
            var tag = ev.target && ev.target.tagName ? String(ev.target.tagName).toLowerCase() : "";
            if (tag === "input") {
              ev.preventDefault();
              var inp = document.getElementById("vc-dialog-input");
              finish(inp ? String(inp.value || "") : "");
            }
            // textarea: Enter = nuova riga; conferma solo col bottone
          }
        }
      };
      document.addEventListener("keydown", keyHandler, true);
      // Sempre in cima allo stack (es. sheet gestione z-index 121000).
      try {
        if (root.parentNode !== document.body) document.body.appendChild(root);
        else document.body.appendChild(root);
      } catch (eTop) {}
      root.removeAttribute("hidden");
      try {
        document.documentElement.classList.add("vc-dialog-open");
      } catch (eOpenCls) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        else if (typeof window.__vcPinPageScroll === "function") window.__vcPinPageScroll();
      } catch (ePin) {}
      requestAnimationFrame(function () {
        root.classList.add("is-open");
        if (kind === "prompt") {
          var focusEl = multiline
            ? document.getElementById("vc-dialog-textarea")
            : document.getElementById("vc-dialog-input");
          if (focusEl && typeof focusEl.focus === "function") {
            focusEl.focus();
            if (typeof focusEl.select === "function" && !multiline) focusEl.select();
            return;
          }
        }
        var focusBtn = root.querySelector(
          kind === "alert"
            ? '[data-vc-dialog="ok"]'
            : kind === "choose"
              ? '[data-vc-dialog="cancel"]'
              : '[data-vc-dialog="cancel"]',
        );
        if (focusBtn && typeof focusBtn.focus === "function") focusBtn.focus();
      });
    });
  }

  function confirmDialog(opts) {
    return openDialog(Object.assign({}, opts || {}, { kind: "confirm" }));
  }

  function alertDialog(opts) {
    if (typeof opts === "string") opts = { message: opts };
    return openDialog(Object.assign({}, opts || {}, { kind: "alert" })).then(function () {});
  }

  function chooseDialog(opts) {
    opts = opts || {};
    return openDialog(Object.assign({}, opts, { kind: "choose", danger: opts.danger === true }));
  }

  function promptDialog(opts) {
    if (typeof opts === "string") opts = { label: opts };
    return openDialog(Object.assign({}, opts || {}, { kind: "prompt" }));
  }

  global.VcDialog = {
    confirm: confirmDialog,
    alert: alertDialog,
    choose: chooseDialog,
    prompt: promptDialog,
  };
})(typeof window !== "undefined" ? window : globalThis);
