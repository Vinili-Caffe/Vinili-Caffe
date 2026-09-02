(function () {
  if (typeof window === "undefined") return;
  if (window.__vcHeaderSiteNameMarqueeWired) return;
  window.__vcHeaderSiteNameMarqueeWired = true;

  var timer = null;
  var TEXT_CLASS = "vc-header-site-name__text";
  var TRACK_CLASS = "vc-header-site-name__track";
  var ROOT_CLASS = "vc-header-site-name";

  function isMobileNavViewport() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 1199.98px)").matches) return true;
    } catch (e) {}
    return false;
  }

    function wantsHeaderNavMarquee() {
    return isMobileNavViewport();
  }

  function isBrandNameLink(el) {
    if (!el || el.tagName !== "A") return false;
    if (el.classList.contains("vc-dashboard-header-guild-name")) return false;
    if (el.classList.contains("vc-header-logo-link")) return false;
    if (el.classList.contains("vc-header-site-name")) {
      var prev = el.previousElementSibling;
      return Boolean(prev && prev.classList && prev.classList.contains("vc-header-logo-link"));
    }
    var prev2 = el.previousElementSibling;
    return Boolean(prev2 && prev2.classList && prev2.classList.contains("vc-header-logo-link"));
  }

  function collectBrandNameLinks(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var logos = scope.querySelectorAll("a.vc-header-logo-link");
    var out = [];
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    for (var i = 0; i < logos.length; i++) {
      var next = logos[i].nextElementSibling;
      if (!isBrandNameLink(next)) continue;
      if (seen) {
        if (seen.has(next)) continue;
        seen.add(next);
      } else if (out.indexOf(next) !== -1) {
        continue;
      }
      out.push(next);
    }
    return out;
  }

  function stripTruncateClass(el) {
    if (!el || !el.classList) return;
    el.classList.remove("truncate");
    try {
      var cls = String(el.getAttribute("class") || "");
      if (/\btruncate\b/.test(cls)) {
        el.setAttribute("class", cls.replace(/\btruncate\b/g, " ").replace(/\s+/g, " ").trim());
      }
    } catch (e) {}
  }

  function brandFallbackText(nameEl) {
    var fallback = "Vinili & Caffè";
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var branded = String(window.VcI18n.t("brand.name") || "").trim();
        if (branded && branded !== "brand.name") return branded;
      }
    } catch (eBrand) {}
    var aria = String((nameEl && nameEl.getAttribute("aria-label")) || "").trim();
    if (!aria || /vai alla homepage|go to homepage|homepage/i.test(aria)) return fallback;
    return aria;
  }

  function ensureStructure(nameEl) {
    if (!nameEl) return null;
    nameEl.classList.add(ROOT_CLASS);
    stripTruncateClass(nameEl);
    var track = nameEl.querySelector("." + TRACK_CLASS);
    if (track) {
      var texts = track.querySelectorAll("." + TEXT_CLASS);
      return { track: track, text: texts[0] || null };
    }
    track = document.createElement("span");
    track.className = TRACK_CLASS;
    var text = document.createElement("span");
    text.className = TEXT_CLASS;
    while (nameEl.firstChild) text.appendChild(nameEl.firstChild);
    if (!String(text.textContent || "").trim()) {
      text.textContent = brandFallbackText(nameEl);
    }
    track.appendChild(text);
    nameEl.appendChild(track);
    return { track: track, text: text };
  }

  function syncOne(nameEl) {
    var parts = ensureStructure(nameEl);
    if (!parts || !parts.track || !parts.text) return;
    var trackEl = parts.track;
    var textEl = parts.text;
    var textNodes = trackEl.querySelectorAll("." + TEXT_CLASS);
    var nextText = String(textEl.textContent || "").trim();

    if (wantsHeaderNavMarquee() && nameEl.classList.contains("is-marquee")) {
      var prevText = String(nameEl.getAttribute("data-vc-marquee-text") || "");
      var hasClone = trackEl.querySelector("." + TEXT_CLASS + ".is-clone");
      var stored = Number(nameEl.getAttribute("data-vc-marquee-dist") || 0);
      if (prevText === nextText && hasClone && Number.isFinite(stored) && stored > 0) {
        void trackEl.offsetWidth;
        var liveDist = Math.max(Math.round(trackEl.scrollWidth / 2), 36);
        if (Math.abs(liveDist - stored) <= 3) {
          return;
        }
      }
    }

    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    nameEl.removeAttribute("data-vc-marquee-dist");
    for (var i = textNodes.length - 1; i >= 1; i--) {
      textNodes[i].parentNode.removeChild(textNodes[i]);
    }
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    void nameEl.offsetWidth;
    var containerW = nameEl.clientWidth || 0;
    if (containerW <= 0) {
      containerW = Math.floor(nameEl.getBoundingClientRect().width || 0);
    }
    if (containerW <= 0) {
      if (wantsHeaderNavMarquee()) {
        window.setTimeout(function () {
          syncOne(nameEl);
        }, 120);
      }
      return;
    }

    if (!wantsHeaderNavMarquee()) return;

    var probe = document.createElement("span");
    probe.textContent = textEl.textContent || "";
    probe.setAttribute("aria-hidden", "true");
    try {
      var cs = window.getComputedStyle(textEl);
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;pointer-events:none;" +
        "font:" +
        cs.font +
        ";letter-spacing:" +
        cs.letterSpacing +
        ";text-transform:" +
        cs.textTransform +
        ";";
    } catch (eProbe) {
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;";
    }
    document.body.appendChild(probe);
    var textW = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
    probe.parentNode.removeChild(probe);

    var active = nameEl.classList.contains("is-marquee");
    var forceNav = wantsHeaderNavMarquee();
    if (!forceNav && textW <= containerW + 2) return;
    if (!forceNav && active && textW <= containerW + 6) return;
    if (!forceNav && !active && textW <= containerW + 8) return;

    var clone = textEl.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("is-clone");
    textEl.style.paddingInlineEnd = "2rem";
    trackEl.appendChild(clone);

    void trackEl.offsetWidth;
    var segmentW = Math.max(Math.round(trackEl.scrollWidth / 2), 36);
    nameEl.style.setProperty("--vc-marquee-distance", segmentW + "px");
    var duration = Math.max(8, Math.min(30, segmentW / 26));
    nameEl.style.setProperty("--vc-marquee-duration", duration.toFixed(1) + "s");
    nameEl.classList.add("is-marquee");
    nameEl.setAttribute("data-vc-marquee-text", nextText);
    nameEl.setAttribute("data-vc-marquee-dist", String(segmentW));
  }

  function syncAll(root) {
    var links = collectBrandNameLinks(root);
    for (var i = 0; i < links.length; i++) syncOne(links[i]);
  }

  function schedule(root) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      syncAll(root);
    }, 320);
  }

  window.__vcSyncHeaderSiteNameMarquee = function (root) {
    schedule(root || document);
  };

  function wire() {
    window.addEventListener("resize", function () {
      schedule(document);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        schedule(document);
      }, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule(document);
    });
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(function () {
          schedule(document);
        });
      }
    } catch (eFonts) {}
    try {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          schedule(document);
        });
        var bars = document.querySelectorAll(".vc-header-bar > div:first-child, .vc-mobile-nav-drawer__brand");
        for (var i = 0; i < bars.length; i++) ro.observe(bars[i]);
        window.__vcHeaderSiteNameRo = ro;
      }
    } catch (eRo) {}
    document.addEventListener("vc:langchange", function () {
      schedule(document);
    });
    try {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          schedule(document);
        });
        var links = collectBrandNameLinks(document);
        for (var li = 0; li < links.length; li += 1) mo.observe(links[li], { childList: true, subtree: true, characterData: true });
        window.__vcHeaderSiteNameMo = mo;
      }
    } catch (eMo) {}
    setTimeout(function () {
      schedule(document);
    }, 120);
    setTimeout(function () {
      schedule(document);
    }, 400);
    setTimeout(function () {
      schedule(document);
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();

(function () {
  if (typeof window === "undefined") return;
  if (window.__vcNameMarqueeWired) return;
  window.__vcNameMarqueeWired = true;

  var timer = null;
  var TRACK_CLASS = "vc-marquee__track";
  var TEXT_CLASS = "vc-marquee__text";

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function collect(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var out = [];
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    function add(el) {
      if (!el || !el.classList) return;
      if (seen) {
        if (seen.has(el)) return;
        seen.add(el);
      } else if (out.indexOf(el) !== -1) {
        return;
      }
      out.push(el);
    }
    if (root && root.matches && root.matches("[data-vc-marquee]")) add(root);
    var nodes = scope.querySelectorAll("[data-vc-marquee]");
    for (var i = 0; i < nodes.length; i += 1) add(nodes[i]);
    return out;
  }

  function ensureStructure(el) {
    if (!el) return null;
    el.classList.add("vc-marquee");
    var track = el.querySelector("." + TRACK_CLASS);
    if (track) {
      var texts = track.querySelectorAll("." + TEXT_CLASS);
      return { track: track, text: texts[0] || null };
    }
    track = document.createElement("span");
    track.className = TRACK_CLASS;
    var text = document.createElement("span");
    text.className = TEXT_CLASS;
    while (el.firstChild) text.appendChild(el.firstChild);
    track.appendChild(text);
    el.appendChild(track);
    return { track: track, text: text };
  }

  function syncOne(el) {
    var parts = ensureStructure(el);
    if (!parts || !parts.track || !parts.text) return;
    var trackEl = parts.track;
    var textEl = parts.text;
    var textNodes = trackEl.querySelectorAll("." + TEXT_CLASS);

    el.classList.remove("is-marquee");
    el.style.removeProperty("--vc-marquee-distance");
    el.style.removeProperty("--vc-marquee-duration");
    for (var i = textNodes.length - 1; i >= 1; i -= 1) {
      textNodes[i].parentNode.removeChild(textNodes[i]);
    }
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    void el.offsetWidth;
    var containerW = el.clientWidth || 0;
    var person = el.closest && el.closest(".vc-home-staff-roster__person");
    if (person) {
      var pcs = window.getComputedStyle(person);
      var pad = (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0);
      var gap = parseFloat(pcs.columnGap || pcs.gap) || 0;
      var used = 0;
      var extra = 0;
      for (var pi = 0; pi < person.children.length; pi += 1) {
        var child = person.children[pi];
        if (child === el) continue;
        used += child.getBoundingClientRect().width;
        extra += 1;
      }
      var avail = Math.floor(person.clientWidth - pad - used - gap * extra);
      if (avail > 0) containerW = avail;
    }
    if (containerW <= 0) return;

    var probe = document.createElement("span");
    probe.textContent = textEl.textContent || "";
    probe.setAttribute("aria-hidden", "true");
    try {
      var cs = window.getComputedStyle(textEl);
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;pointer-events:none;" +
        "font:" +
        cs.font +
        ";letter-spacing:" +
        cs.letterSpacing +
        ";text-transform:" +
        cs.textTransform +
        ";";
    } catch (eProbe) {
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;";
    }
    document.body.appendChild(probe);
    var textW = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
    probe.parentNode.removeChild(probe);

    if (textW <= containerW + 2) return;
    if (prefersReducedMotion()) {
      el.style.textOverflow = "ellipsis";
      return;
    }

    var clone = textEl.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("is-clone");
    trackEl.appendChild(clone);
    textEl.style.paddingInlineEnd = "1.6rem";

    var segmentW = Math.ceil(textEl.getBoundingClientRect().width || textEl.scrollWidth || textW);
    if (segmentW <= 0) segmentW = textW + 26;
    el.style.setProperty("--vc-marquee-distance", segmentW + "px");
    var duration = Math.max(7, Math.min(22, segmentW / 28));
    el.style.setProperty("--vc-marquee-duration", duration.toFixed(1) + "s");
    el.classList.add("is-marquee");
  }

  function syncAll(root) {
    var nodes = collect(root);
    for (var i = 0; i < nodes.length; i += 1) syncOne(nodes[i]);
  }

  function schedule(root) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      syncAll(root);
    }, 60);
  }

  window.__vcSyncNameMarquees = function (root) {
    schedule(root || document);
  };

  function nodeAddsMarquee(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches("[data-vc-marquee]")) return true;
    if (node.querySelector && node.querySelector("[data-vc-marquee]")) return true;
    return false;
  }

  function wire() {
    window.addEventListener("resize", function () {
      schedule(document);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        schedule(document);
      }, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule(document);
    });
    try {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function (records) {
          for (var i = 0; i < records.length; i += 1) {
            var rec = records[i];
            if (rec.type !== "childList") continue;
            var added = rec.addedNodes || [];
            for (var j = 0; j < added.length; j += 1) {
              if (nodeAddsMarquee(added[j])) {
                schedule(document);
                return;
              }
            }
          }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (eMo) {}
    try {
      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          schedule(document);
        });
        var hosts = document.querySelectorAll("#vc-home-staff-roster, [data-vc-marquee]");
        for (var i = 0; i < hosts.length; i += 1) ro.observe(hosts[i]);
        window.__vcNameMarqueeRo = ro;
      }
    } catch (eRo) {}
    setTimeout(function () {
      schedule(document);
    }, 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
