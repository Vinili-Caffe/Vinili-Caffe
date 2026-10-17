/**
 * vcColorPick1 — selettore colore custom (stesso UX della bacheca).
 * pickerFloatFix1: pop in body + position:fixed (non segue lo scroll della pagina).
 * window.VcColorPicker.markup(opts) / .bind(root, opts) / .bindAll(scope)
 */
(function (global) {
  "use strict";

  var uid = 0;
  var FLOAT_STAMP = "pickerFloatFix1";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHex(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.charAt(0) !== "#") s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      s =
        "#" +
        s.charAt(1) +
        s.charAt(1) +
        s.charAt(2) +
        s.charAt(2) +
        s.charAt(3) +
        s.charAt(3);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
    return s.toLowerCase();
  }

  function hexToHsv(hexStr) {
    var h = normalizeHex(hexStr) || "#d4a888";
    var r = parseInt(h.slice(1, 3), 16) / 255;
    var g = parseInt(h.slice(3, 5), 16) / 255;
    var b = parseInt(h.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var hh = 0;
    if (d) {
      if (max === r) hh = ((g - b) / d) % 6;
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
    }
    var s = max === 0 ? 0 : d / max;
    return { h: hh, s: s, v: max };
  }

  function hsvToHex(h, s, v) {
    h = ((Number(h) % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, Number(s) || 0));
    v = Math.max(0, Math.min(1, Number(v) || 0));
    var c = v * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = v - c;
    var r = 0;
    var g = 0;
    var b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    function to2(n) {
      var v2 = Math.round((n + m) * 255);
      var s2 = Math.max(0, Math.min(255, v2)).toString(16);
      return s2.length === 1 ? "0" + s2 : s2;
    }
    return ("#" + to2(r) + to2(g) + to2(b)).toLowerCase();
  }

  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.value]
   * @param {string} [opts.defaultHex]
   * @param {string} [opts.ariaLabel]
   * @param {boolean} [opts.allowEmpty]
   * @param {boolean} [opts.showReset]
   * @param {boolean} [opts.showHexInput] default true
   * @param {string} [opts.hexInputAttrs] extra attrs string for hex input
   * @param {string} [opts.className] extra classes on wrap
   * @param {string} [opts.wrapAttrs]
   * @param {string} [opts.placeholder]
   */
  function markup(opts) {
    opts = opts || {};
    uid += 1;
    var id = String(opts.id || "vc-cp-" + uid);
    var def = normalizeHex(opts.defaultHex) || "#d4a888";
    var value = normalizeHex(opts.value) || (opts.allowEmpty ? "" : def);
    var label = String(opts.ariaLabel || "Seleziona colore");
    var showHex = opts.showHexInput !== false;
    var showReset = opts.showReset === true || opts.allowEmpty === true;
    var placeholder = String(opts.placeholder || (opts.allowEmpty ? "Predefinito" : def));
    var popId = id + "-pop";
    var faceBg = value || def;
    var cls = "vc-cp" + (value ? "" : " is-default") + (opts.className ? " " + opts.className : "");
    return (
      '<span class="' +
      esc(cls) +
      '" data-vc-cp="1" data-vc-cp-id="' +
      esc(id) +
      '"' +
      (opts.allowEmpty ? ' data-vc-cp-allow-empty="1"' : "") +
      ' data-vc-cp-default="' +
      esc(def) +
      '"' +
      (opts.wrapAttrs ? " " + opts.wrapAttrs : "") +
      ">" +
      '<span class="vc-cp__row">' +
      '<button type="button" class="vc-cp__swatch vc-no-sfx" id="' +
      esc(id) +
      '-swatch" title="Anteprima colore" aria-label="' +
      esc(label) +
      '" aria-haspopup="dialog" aria-expanded="false" aria-controls="' +
      esc(popId) +
      '">' +
      '<span class="vc-cp__swatch-face" style="background:' +
      esc(faceBg) +
      '" aria-hidden="true"></span></button>' +
      (showHex
        ? '<span class="vc-cp__hexwrap">' +
          '<input class="vc-cp__hex" id="' +
          esc(id) +
          '-hex" name="' +
          esc(id) +
          '-hex" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="7" placeholder="' +
          esc(placeholder) +
          '" value="' +
          esc(value) +
          '" aria-label="' +
          esc(label) +
          " hex" +
          '" aria-haspopup="dialog" aria-expanded="false" aria-controls="' +
          esc(popId) +
          '"' +
          (opts.hexInputAttrs ? " " + opts.hexInputAttrs : "") +
          " />" +
          (showReset
            ? '<button type="button" class="vc-cp__reset vc-no-sfx" data-vc-cp-reset="1"' +
              (value ? "" : " hidden") +
              ' title="Colore predefinito" aria-label="Ripristina colore predefinito">' +
              '<i class="fa fa-times" aria-hidden="true"></i></button>'
            : "") +
          "</span>"
        : '<input type="hidden" class="vc-cp__hex" id="' +
          esc(id) +
          '-hex" name="' +
          esc(id) +
          '-hex" value="' +
          esc(value) +
          '"' +
          (opts.hexInputAttrs ? " " + opts.hexInputAttrs : "") +
          " />") +
      "</span>" +
      '<span class="vc-cp__pop vc-no-sfx" id="' +
      esc(popId) +
      '" hidden role="dialog" aria-label="Selettore colore">' +
      '<span class="vc-cp__sv" data-vc-cp-sv tabindex="-1">' +
      '<span class="vc-cp__sv-white" aria-hidden="true"></span>' +
      '<span class="vc-cp__sv-black" aria-hidden="true"></span>' +
      '<span class="vc-cp__thumb" data-vc-cp-thumb aria-hidden="true"></span></span>' +
      '<span class="vc-cp__hue-wrap" data-vc-cp-hue-wrap>' +
      '<span class="vc-cp__hue-rail" aria-hidden="true"></span>' +
      '<span class="vc-cp__hue-knob" data-vc-cp-hue-knob aria-hidden="true"></span>' +
      /* formIdName1: hue range deve avere id+name (Issues Chrome) */
      '<input type="range" class="vc-cp__hue vc-no-sfx" id="' +
      esc(id) +
      '-hue" name="' +
      esc(id) +
      '-hue" data-vc-cp-hue min="0" max="360" step="1" aria-label="Tonalita" /></span>' +
      '<span class="vc-cp__meta">' +
      '<span class="vc-cp__live" data-vc-cp-live aria-hidden="true"></span>' +
      '<span class="vc-cp__hexlab" data-vc-cp-hexlab>' +
      esc(value || (opts.allowEmpty ? "Predefinito" : def)) +
      "</span></span></span></span>"
    );
  }

  function bind(root, opts) {
    opts = opts || {};
    var wrap = root && root.nodeType === 1 ? root : null;
    if (!wrap || wrap.getAttribute("data-vc-cp-bound") === "1") return null;
    var hex = wrap.querySelector(".vc-cp__hex");
    var swatch = wrap.querySelector(".vc-cp__swatch");
    var face = wrap.querySelector(".vc-cp__swatch-face");
    var pop = wrap.querySelector(".vc-cp__pop");
    var sv = wrap.querySelector("[data-vc-cp-sv]");
    var thumb = wrap.querySelector("[data-vc-cp-thumb]");
    var hue = wrap.querySelector("[data-vc-cp-hue]");
    var hueWrap = wrap.querySelector("[data-vc-cp-hue-wrap]");
    var hueKnob = wrap.querySelector("[data-vc-cp-hue-knob]");
    var live = wrap.querySelector("[data-vc-cp-live]");
    var hexlab = wrap.querySelector("[data-vc-cp-hexlab]");
    var resetBtn = wrap.querySelector("[data-vc-cp-reset]");
    var externalHex = opts.hexInput || null;
    if (!wrap || !hex || !pop || !sv || !hue) return null;

    var DEFAULT = normalizeHex(wrap.getAttribute("data-vc-cp-default") || opts.defaultHex) || "#d4a888";
    var allowEmpty =
      wrap.getAttribute("data-vc-cp-allow-empty") === "1" || opts.allowEmpty === true;
    var state = hexToHsv(normalizeHex(hex.value) || DEFAULT);
    var open = false;
    var dragging = false;
    var hueDragging = false;
    var syncFromPicker = false;
    var popHomeParent = pop && pop.parentNode ? pop.parentNode : wrap;
    var floatBound = false;
    var floatScrollTargets = [];

    function linkedHex() {
      return externalHex || hex;
    }

    function readViewport() {
      try {
        var vv = window.visualViewport;
        if (vv && typeof vv.height === "number" && vv.height > 0) {
          return {
            top: Number(vv.offsetTop) || 0,
            left: Number(vv.offsetLeft) || 0,
            width: Number(vv.width) || window.innerWidth || 0,
            height: Number(vv.height) || window.innerHeight || 0,
          };
        }
      } catch (eVv) {}
      return {
        top: 0,
        left: 0,
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
      };
    }

    function listScrollParents(el) {
      var out = [];
      var node = el && el.parentElement;
      while (node && node !== document.documentElement) {
        try {
          var style = window.getComputedStyle(node);
          var oy = style.overflowY || style.overflow || "";
          var ox = style.overflowX || style.overflow || "";
          if (/(auto|scroll|overlay)/.test(oy) || /(auto|scroll|overlay)/.test(ox)) {
            out.push(node);
          }
        } catch (eSp) {}
        node = node.parentElement;
      }
      out.push(window);
      return out;
    }

    function clearFloatScroll() {
      for (var i = 0; i < floatScrollTargets.length; i += 1) {
        try {
          floatScrollTargets[i].removeEventListener("scroll", positionPop, true);
        } catch (eClr) {}
      }
      floatScrollTargets = [];
    }

    function bindFloatListeners() {
      if (floatBound) return;
      floatBound = true;
      window.addEventListener("resize", positionPop, true);
      try {
        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", positionPop, true);
          window.visualViewport.addEventListener("scroll", positionPop, true);
        }
      } catch (eBind) {}
      clearFloatScroll();
      floatScrollTargets = listScrollParents(wrap);
      for (var i = 0; i < floatScrollTargets.length; i += 1) {
        floatScrollTargets[i].addEventListener("scroll", positionPop, true);
      }
    }

    function unbindFloatListeners() {
      if (!floatBound) return;
      floatBound = false;
      window.removeEventListener("resize", positionPop, true);
      try {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", positionPop, true);
          window.visualViewport.removeEventListener("scroll", positionPop, true);
        }
      } catch (eUn) {}
      clearFloatScroll();
    }

    function positionPop() {
      if (!open || !pop) return;
      var anchor = swatch || hex || wrap;
      var rect;
      try {
        rect = anchor.getBoundingClientRect();
      } catch (eR) {
        return;
      }
      var vp = readViewport();
      var pad = 8;
      var gap = 8;
      pop.classList.add("is-floating");
      pop.style.position = "fixed";
      pop.style.right = "auto";
      pop.style.bottom = "auto";
      pop.style.zIndex = "121250";
      var w = Math.min(Math.max(pop.offsetWidth || 244, 200), Math.max(160, vp.width - pad * 2));
      pop.style.width = w + "px";
      pop.style.maxWidth = Math.max(160, vp.width - pad * 2) + "px";
      void pop.offsetHeight;
      var h = Math.min(Math.max(pop.offsetHeight || 220, 160), vp.height - pad * 2);
      var spaceAbove = Math.max(0, rect.top - (vp.top + pad));
      var spaceBelow = Math.max(0, vp.top + vp.height - pad - rect.bottom);
      var placeAbove = spaceAbove >= h + gap || spaceAbove > spaceBelow;
      var left = Math.max(
        vp.left + pad,
        Math.min(rect.left, vp.left + vp.width - w - pad),
      );
      var top;
      if (placeAbove) {
        top = rect.top - h - gap;
        if (top < vp.top + pad) top = vp.top + pad;
      } else {
        top = rect.bottom + gap;
        if (top + h > vp.top + vp.height - pad) {
          top = Math.max(vp.top + pad, vp.top + vp.height - h - pad);
        }
      }
      pop.style.left = Math.round(left) + "px";
      pop.style.top = Math.round(top) + "px";
      pop.setAttribute("data-vc-cp-float", FLOAT_STAMP);
    }

    function mountPopFloating() {
      if (!pop) return;
      if (pop.parentElement !== document.body) {
        popHomeParent = pop.parentNode || wrap;
        document.body.appendChild(pop);
      }
      bindFloatListeners();
      positionPop();
      requestAnimationFrame(function () {
        if (open) positionPop();
      });
    }

    function unmountPopFloating() {
      unbindFloatListeners();
      if (!pop) return;
      pop.classList.remove("is-floating");
      pop.removeAttribute("data-vc-cp-float");
      pop.style.position = "";
      pop.style.left = "";
      pop.style.top = "";
      pop.style.right = "";
      pop.style.bottom = "";
      pop.style.width = "";
      pop.style.maxWidth = "";
      pop.style.zIndex = "";
      if (popHomeParent && pop.parentElement === document.body) {
        try {
          popHomeParent.appendChild(pop);
        } catch (eHome) {}
      }
    }

    function emit() {
      syncFromPicker = true;
      var target = linkedHex();
      try {
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e0) {}
      try {
        target.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e1) {}
      syncFromPicker = false;
      if (typeof opts.onChange === "function") {
        try {
          opts.onChange(normalizeHex(target.value) || (allowEmpty ? "" : DEFAULT));
        } catch (e2) {}
      }
    }

    function syncResetBtn() {
      if (!resetBtn) return;
      if (normalizeHex(linkedHex().value)) resetBtn.removeAttribute("hidden");
      else resetBtn.setAttribute("hidden", "");
    }

    function paint(fromHexInput, keepEmpty) {
      var c = hsvToHex(state.h, state.s, state.v);
      var target = linkedHex();
      if (keepEmpty) {
        target.value = "";
        if (hex !== target) hex.value = "";
        wrap.classList.add("is-default");
        if (face) face.style.background = DEFAULT;
        if (live) live.style.background = DEFAULT;
        if (hexlab) hexlab.textContent = "Predefinito";
      } else {
        if (!fromHexInput) {
          target.value = c;
          if (hex !== target) hex.value = c;
        } else if (hex !== target) {
          hex.value = normalizeHex(target.value) || c;
        }
        wrap.classList.remove("is-default");
        var shown = normalizeHex(target.value) || c;
        if (face) face.style.background = shown;
        if (live) live.style.background = shown;
        if (hexlab) hexlab.textContent = shown;
      }
      var hueDeg = Math.round(((Number(state.h) % 360) + 360) % 360);
      if (hueDeg === 360) hueDeg = 0;
      state.h = hueDeg;
      sv.style.setProperty("--vc-accent-hue", String(hueDeg));
      hue.value = String(hueDeg);
      if (hueWrap) {
        hueWrap.style.setProperty("--vc-accent-hue", String(hueDeg));
        hueWrap.style.setProperty("--vc-hue-pct", (hueDeg / 360) * 100 + "%");
      }
      if (hueKnob) hueKnob.style.background = "hsl(" + hueDeg + ", 100%, 50%)";
      if (thumb) {
        thumb.style.left = state.s * 100 + "%";
        thumb.style.top = (1 - state.v) * 100 + "%";
      }
      syncResetBtn();
      return keepEmpty ? "" : c;
    }

    function applyHexToState(hexStr, keepHueIfGray) {
      var c = normalizeHex(hexStr);
      if (!c) return "";
      var next = hexToHsv(c);
      if (keepHueIfGray && next.s < 0.02) next.h = state.h;
      state = next;
      return c;
    }

    function setOpen(next) {
      open = !!next;
      pop.hidden = !open;
      wrap.classList.toggle("is-open", open);
      if (swatch) swatch.setAttribute("aria-expanded", open ? "true" : "false");
      hex.setAttribute("aria-expanded", open ? "true" : "false");
      if (externalHex) externalHex.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        if (normalizeHex(linkedHex().value)) paint(true);
        else paint(false, allowEmpty);
        mountPopFloating();
      } else {
        unmountPopFloating();
      }
    }

    function applySvFromPointer(ev) {
      var rect = sv.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = (ev.clientX - rect.left) / rect.width;
      var y = (ev.clientY - rect.top) / rect.height;
      state.s = Math.max(0, Math.min(1, x));
      state.v = Math.max(0, Math.min(1, 1 - y));
      paint(false);
      emit();
    }

    function applyHueFromPointer(ev) {
      if (!hueWrap) return;
      var rect = hueWrap.getBoundingClientRect();
      if (!rect.width) return;
      var x = (ev.clientX - rect.left) / rect.width;
      state.h = Math.max(0, Math.min(359, Math.round(x * 360)));
      paint(false);
      emit();
    }

    if (normalizeHex(linkedHex().value)) paint(true);
    else paint(false, allowEmpty);

    function openPicker(ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      setOpen(true);
    }

    hex.addEventListener("focus", function () {
      setOpen(true);
    });
    hex.addEventListener("click", openPicker);
    if (swatch) swatch.addEventListener("click", openPicker);
    if (externalHex) {
      externalHex.addEventListener("focus", function () {
        setOpen(true);
      });
      externalHex.addEventListener("click", openPicker);
    }

    function onHexInput() {
      if (syncFromPicker) return;
      var target = linkedHex();
      if (!String(target.value || "").trim()) {
        if (!allowEmpty) return;
        state = hexToHsv(DEFAULT);
        paint(false, true);
        return;
      }
      var c = applyHexToState(target.value, true);
      if (!c) return;
      paint(true);
    }

    hex.addEventListener("input", onHexInput);
    hex.addEventListener("change", onHexInput);
    if (externalHex) {
      externalHex.addEventListener("input", onHexInput);
      externalHex.addEventListener("change", onHexInput);
    }

    hex.addEventListener("blur", function () {
      var target = linkedHex();
      if (!String(target.value || "").trim()) {
        if (allowEmpty) {
          state = hexToHsv(DEFAULT);
          paint(false, true);
        }
        return;
      }
      var c = applyHexToState(target.value, true);
      if (c) {
        target.value = c;
        if (hex !== target) hex.value = c;
        paint(true);
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function (ev) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
        } catch (ePr) {}
        state = hexToHsv(DEFAULT);
        paint(false, allowEmpty);
        setOpen(false);
        emit();
      });
    }

    hue.addEventListener("input", function () {
      state.h = Number(hue.value) || 0;
      paint(false);
      emit();
    });
    hue.addEventListener("change", function () {
      state.h = Number(hue.value) || 0;
      paint(false);
      emit();
    });

    if (hueWrap) {
      hueWrap.addEventListener("pointerdown", function (ev) {
        hueDragging = true;
        try {
          hueWrap.setPointerCapture(ev.pointerId);
        } catch (eHc) {}
        applyHueFromPointer(ev);
        try {
          ev.preventDefault();
        } catch (ePd) {}
      });
      hueWrap.addEventListener("pointermove", function (ev) {
        if (!hueDragging) return;
        applyHueFromPointer(ev);
      });
      function endHueDrag(ev) {
        hueDragging = false;
        try {
          if (ev && ev.pointerId != null) hueWrap.releasePointerCapture(ev.pointerId);
        } catch (eHr) {}
      }
      hueWrap.addEventListener("pointerup", endHueDrag);
      hueWrap.addEventListener("pointercancel", endHueDrag);
    }

    sv.addEventListener("pointerdown", function (ev) {
      dragging = true;
      try {
        sv.setPointerCapture(ev.pointerId);
      } catch (eC) {}
      applySvFromPointer(ev);
    });
    sv.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      applySvFromPointer(ev);
    });
    function endDrag(ev) {
      dragging = false;
      try {
        if (ev && ev.pointerId != null) sv.releasePointerCapture(ev.pointerId);
      } catch (eR) {}
    }
    sv.addEventListener("pointerup", endDrag);
    sv.addEventListener("pointercancel", endDrag);

    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (!open) return;
        if (wrap.contains(ev.target)) return;
        if (pop && pop.contains(ev.target)) return;
        setOpen(false);
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (!open) return;
      if (ev.key === "Escape") setOpen(false);
    });

    wrap.setAttribute("data-vc-cp-bound", "1");
    return {
      setValue: function (hexStr) {
        var c = applyHexToState(hexStr, true);
        if (c) {
          linkedHex().value = c;
          paint(true);
        } else if (allowEmpty && !String(hexStr || "").trim()) {
          state = hexToHsv(DEFAULT);
          paint(false, true);
        }
      },
      getValue: function () {
        return normalizeHex(linkedHex().value) || (allowEmpty ? "" : DEFAULT);
      },
      open: function () {
        setOpen(true);
      },
      close: function () {
        setOpen(false);
      },
    };
  }

  function bindAll(scope, opts) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var nodes = root.querySelectorAll("[data-vc-cp]:not([data-vc-cp-bound='1'])");
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var api = bind(nodes[i], opts);
      if (api) out.push(api);
    }
    return out;
  }

  function findSiblingHex(input) {
    var row =
      input.closest(
        ".vc-dash-quote-style__custom-color-row, .vc-dash-tk-color, .vc-cpf-colorpick, .vc-rank-fieldrow__inputs, label, .vc-dash-picker",
      ) || input.parentElement;
    if (!row) return null;
    var texts = row.querySelectorAll('input[type="text"], input.vc-dash-quote-style__hex');
    for (var i = 0; i < texts.length; i++) {
      if (texts[i] === input) continue;
      if (texts[i].classList && texts[i].classList.contains("vc-cp__hex")) continue;
      return texts[i];
    }
    return null;
  }

  function patchNativeValue(input, api) {
    var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!proto || !proto.get || !proto.set || input.__vcCpValuePatched) return;
    input.__vcCpValuePatched = true;
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: true,
      get: function () {
        return proto.get.call(this);
      },
      set: function (v) {
        proto.set.call(this, v);
        if (this.__vcCpSyncing) return;
        if (api && typeof api.setValue === "function") {
          try {
            api.setValue(v);
          } catch (eSet) {}
        }
      },
    });
  }

  /**
   * Sostituisce input[type=color] nativi con swatch custom (mantiene l'input nascosto syncato).
   */
  function upgradeNatives(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var nodes = root.querySelectorAll('input[type="color"]:not([data-vc-cp-native="1"])');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var input = nodes[i];
      if (!input || input.closest("[data-vc-cp]")) continue;
      if (input.getAttribute("data-vc-cp-skip") === "1") continue;
      var val = normalizeHex(input.value) || "#000000";
      var host = document.createElement("span");
      host.innerHTML = markup({
        id: (input.id || "native-color") + "-vc",
        value: val,
        defaultHex: val,
        ariaLabel: input.getAttribute("aria-label") || input.title || "Seleziona colore",
        showHexInput: false,
        showReset: false,
        allowEmpty: false,
        className: "vc-cp--swatch-only",
      });
      var wrap = host.firstElementChild;
      if (!wrap || !input.parentNode) continue;
      input.parentNode.insertBefore(wrap, input);
      input.setAttribute("data-vc-cp-native", "1");
      input.setAttribute("tabindex", "-1");
      input.setAttribute("aria-hidden", "true");
      input.classList.add("vc-cp-native-hidden");
      var hexSibling = findSiblingHex(input);
      var api = bind(wrap, {
        hexInput: hexSibling || null,
        onChange: function (v) {
          var next = normalizeHex(v) || val;
          input.__vcCpSyncing = true;
          try {
            input.value = next;
          } catch (eV) {}
          input.__vcCpSyncing = false;
          try {
            input.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (eI) {}
          try {
            input.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (eC) {}
        },
      });
      if (api) {
        patchNativeValue(input, api);
        input.__vcCp = api;
        wrap.__vcCp = api;
        out.push(api);
      }
    }
    return out;
  }

  global.VcColorPicker = {
    markup: markup,
    bind: bind,
    bindAll: bindAll,
    upgradeNatives: upgradeNatives,
    normalizeHex: normalizeHex,
  };
})(typeof window !== "undefined" ? window : globalThis);
