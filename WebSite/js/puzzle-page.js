/* puzzleHs9 — vassoio: pezzi visti restano rivelati; click token = quel pezzo */
(function () {
  "use strict";

  var COLS = 6;
  var ROWS = 3;
  var IMG_SRC = "/images/star-wars-italia-galaxy.png?v=20260926puzzleHs9";
  var TAB_RATIO = 0.2;

  var state = {
    img: null,
    edges: null,
    pieces: [],
    slots: [],
    placed: Object.create(null),
    hand: null,
    pointerX: 0,
    pointerY: 0,
    boardW: 0,
    boardH: 0,
    cellW: 0,
    cellH: 0,
    tab: 0,
    pieceW: 0,
    pieceH: 0,
    ready: false,
    complete: false,
    confettiRaf: 0,
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function makeEdges() {
    var right = [];
    var bottom = [];
    var r, c;
    for (r = 0; r < ROWS; r++) {
      right[r] = [];
      for (c = 0; c < COLS - 1; c++) right[r][c] = Math.random() < 0.5 ? 1 : -1;
    }
    for (r = 0; r < ROWS - 1; r++) {
      bottom[r] = [];
      for (c = 0; c < COLS; c++) bottom[r][c] = Math.random() < 0.5 ? 1 : -1;
    }
    return { right: right, bottom: bottom };
  }

  function edgesFor(r, c, E) {
    return {
      top: r === 0 ? 0 : -E.bottom[r - 1][c],
      right: c === COLS - 1 ? 0 : E.right[r][c],
      bottom: r === ROWS - 1 ? 0 : E.bottom[r][c],
      left: c === 0 ? 0 : -E.right[r][c - 1],
    };
  }

  function piecePath(ctx, x, y, w, h, e, tab) {
    var midX = x + w / 2;
    var midY = y + h / 2;
    var neck = tab * 0.55;
    var bulge = tab;

    ctx.beginPath();
    ctx.moveTo(x, y);

    if (!e.top) ctx.lineTo(x + w, y);
    else {
      ctx.lineTo(midX - neck, y);
      ctx.bezierCurveTo(midX - neck, y - e.top * bulge * 0.2, midX - bulge * 0.95, y - e.top * bulge, midX, y - e.top * bulge);
      ctx.bezierCurveTo(midX + bulge * 0.95, y - e.top * bulge, midX + neck, y - e.top * bulge * 0.2, midX + neck, y);
      ctx.lineTo(x + w, y);
    }

    if (!e.right) ctx.lineTo(x + w, y + h);
    else {
      ctx.lineTo(x + w, midY - neck);
      ctx.bezierCurveTo(x + w + e.right * bulge * 0.2, midY - neck, x + w + e.right * bulge, midY - bulge * 0.95, x + w + e.right * bulge, midY);
      ctx.bezierCurveTo(x + w + e.right * bulge, midY + bulge * 0.95, x + w + e.right * bulge * 0.2, midY + neck, x + w, midY + neck);
      ctx.lineTo(x + w, y + h);
    }

    if (!e.bottom) ctx.lineTo(x, y + h);
    else {
      ctx.lineTo(midX + neck, y + h);
      ctx.bezierCurveTo(midX + neck, y + h + e.bottom * bulge * 0.2, midX + bulge * 0.95, y + h + e.bottom * bulge, midX, y + h + e.bottom * bulge);
      ctx.bezierCurveTo(midX - bulge * 0.95, y + h + e.bottom * bulge, midX - neck, y + h + e.bottom * bulge * 0.2, midX - neck, y + h);
      ctx.lineTo(x, y + h);
    }

    if (!e.left) ctx.lineTo(x, y);
    else {
      ctx.lineTo(x, midY + neck);
      ctx.bezierCurveTo(x - e.left * bulge * 0.2, midY + neck, x - e.left * bulge, midY + bulge * 0.95, x - e.left * bulge, midY);
      ctx.bezierCurveTo(x - e.left * bulge, midY - bulge * 0.95, x - e.left * bulge * 0.2, midY - neck, x, midY - neck);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
  }

  function renderPieceCanvas(piece, displayW, displayH) {
    var img = state.img;
    var tab = state.tab;
    var pad = tab + 2;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var canvas = piece.canvas;
    canvas.width = Math.ceil((displayW + pad * 2) * dpr);
    canvas.height = Math.ceil((displayH + pad * 2) * dpr);
    canvas.style.width = displayW + pad * 2 + "px";
    canvas.style.height = displayH + pad * 2 + "px";

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW + pad * 2, displayH + pad * 2);

    var ox = pad;
    var oy = pad;
    piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
    ctx.save();
    ctx.clip();

    var sx = (piece.col / COLS) * img.naturalWidth;
    var sy = (piece.row / ROWS) * img.naturalHeight;
    var sw = img.naturalWidth / COLS;
    var sh = img.naturalHeight / ROWS;
    var expandX = (tab / displayW) * sw;
    var expandY = (tab / displayH) * sh;
    ctx.drawImage(img, sx - expandX, sy - expandY, sw + expandX * 2, sh + expandY * 2, ox - tab, oy - tab, displayW + tab * 2, displayH + tab * 2);
    ctx.restore();

    piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
    ctx.strokeStyle = "rgba(20, 12, 8, 0.55)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
    ctx.strokeStyle = "rgba(255, 240, 220, 0.28)";
    ctx.lineWidth = 0.75;
    ctx.stroke();

    piece.el.style.width = displayW + pad * 2 + "px";
    piece.el.style.height = displayH + pad * 2 + "px";
    piece.el.style.setProperty("--pz-piece-w", displayW + pad * 2 + "px");
    piece.el.style.setProperty("--pz-piece-h", displayH + pad * 2 + "px");
  }

  function trayPieces() {
    return state.pieces.filter(function (p) {
      return p.home === "tray";
    });
  }

  function updateProgress() {
    var n = 0;
    for (var i = 0; i < state.pieces.length; i++) {
      if (state.placed[state.pieces[i].id] === state.pieces[i].id) n++;
    }
    if (els.progress) els.progress.textContent = n + " / " + state.pieces.length;
    var left = trayPieces().length;
    if (els.trayLabel) {
      els.trayLabel.textContent = left
        ? "Vassoio · clicca per pescare (" + left + ")"
        : state.hand
          ? "Pezzo in mano · clicca uno slot"
          : "Vassoio vuoto";
    }
    if (els.trayWrap) els.trayWrap.classList.toggle("is-empty", left === 0 && !state.hand);
    if (n === state.pieces.length && !state.complete) {
      state.complete = true;
      if (els.board) els.board.classList.add("is-complete");
      startConfetti();
      if (els.done) els.done.hidden = false;
    }
  }

  function syncHoldingUi() {
    document.body.classList.toggle("is-holding", !!state.hand);
    if (els.floatHint) els.floatHint.hidden = !state.hand;
  }

  function moveFloating(x, y) {
    state.pointerX = x;
    state.pointerY = y;
    if (!state.hand) return;
    state.hand.el.style.left = x + "px";
    state.hand.el.style.top = y + "px";
    if (els.floatHint) {
      els.floatHint.style.left = x + "px";
      els.floatHint.style.top = y + state.hand.el.offsetHeight * 0.42 + "px";
    }
  }

  function clearBoardSlots() {
    state.slots.forEach(function (slot) {
      slot.el.innerHTML = "";
      slot.el.classList.add("vc-puzzle-slot--empty");
      slot.el.classList.remove("is-ok-flash", "is-bad-flash");
      slot.pieceId = null;
    });
    state.placed = Object.create(null);
  }

  function fitBoardBox() {
    if (!els.board || !els.boardWrap) return;
    var wrap = els.boardWrap.getBoundingClientRect();
    var pad = 12;
    var maxW = Math.max(120, wrap.width - pad);
    var maxH = Math.max(100, wrap.height - pad);
    var ratio = 1600 / 816;
    var w = maxW;
    var h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    els.board.style.width = w + "px";
    els.board.style.height = h + "px";
  }

  function layoutBoard() {
    if (!els.board) return;
    fitBoardBox();
    var rect = els.board.getBoundingClientRect();
    state.boardW = rect.width;
    state.boardH = rect.height;
    state.cellW = state.boardW / COLS;
    state.cellH = state.boardH / ROWS;
    state.tab = Math.min(state.cellW, state.cellH) * TAB_RATIO;
    state.pieceW = state.cellW;
    state.pieceH = state.cellH;

    state.slots.forEach(function (slot) {
      slot.el.style.left = slot.col * state.cellW + "px";
      slot.el.style.top = slot.row * state.cellH + "px";
      slot.el.style.width = state.cellW + "px";
      slot.el.style.height = state.cellH + "px";
    });

    state.pieces.forEach(function (p) {
      if (p.home === "tray") return;
      renderPieceCanvas(p, state.pieceW, state.pieceH);
    });
    if (state.hand) moveFloating(state.pointerX, state.pointerY);
  }

  function makeToken(piece) {
    var tok = document.createElement("button");
    tok.type = "button";
    tok.className = "vc-puzzle-token";
    tok.dataset.pieceId = piece.id;
    tok.setAttribute("aria-label", "Pezzo coperto");
    tok.addEventListener("click", function (ev) {
      ev.stopPropagation();
      drawPiece(piece, ev.clientX, ev.clientY);
    });
    piece.tokenEl = tok;
    paintTokenFace(piece);
    return tok;
  }

  function paintTokenFace(piece) {
    var tok = piece.tokenEl;
    if (!tok) return;
    if (!piece.seen || !state.img) {
      tok.classList.remove("is-revealed");
      tok.style.backgroundImage = "";
      tok.setAttribute("aria-label", "Pezzo coperto");
      return;
    }
    var img = state.img;
    var size = 72;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var sx = (piece.col / COLS) * img.naturalWidth;
    var sy = (piece.row / ROWS) * img.naturalHeight;
    var sw = img.naturalWidth / COLS;
    var sh = img.naturalHeight / ROWS;
    var scale = Math.max(size / sw, size / sh);
    var dw = sw * scale;
    var dh = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
    tok.classList.add("is-revealed");
    tok.style.backgroundImage = 'url("' + canvas.toDataURL("image/jpeg", 0.82) + '")';
    tok.setAttribute("aria-label", "Pezzo visto");
  }

  function clearTokenRemoveTimer(piece) {
    if (piece && piece._tokenRemoveTimer) {
      clearTimeout(piece._tokenRemoveTimer);
      piece._tokenRemoveTimer = 0;
    }
  }

  function putTokenInTray(piece) {
    clearTokenRemoveTimer(piece);
    piece.home = "tray";
    piece.el.classList.remove("is-placed", "is-locked", "is-wrong", "is-floating", "is-settled");
    piece.el.style.left = "";
    piece.el.style.top = "";
    piece.el.style.animation = "";
    piece.el.style.filter = "";
    if (!piece.tokenEl) makeToken(piece);
    piece.tokenEl.classList.remove("is-drawing");
    if (piece.el.parentNode) piece.el.parentNode.removeChild(piece.el);
    paintTokenFace(piece);
    if (piece.tokenEl.parentNode !== els.tray) els.tray.appendChild(piece.tokenEl);
  }

  function flashSlotOk(slot) {
    slot.el.classList.remove("is-ok-flash", "is-bad-flash");
    void slot.el.offsetWidth;
    slot.el.classList.add("is-ok-flash");
    window.setTimeout(function () {
      slot.el.classList.remove("is-ok-flash");
    }, 560);
  }

  function buildDom() {
    els.board.innerHTML = "";
    els.tray.innerHTML = "";
    if (state.hand && state.hand.el.parentNode) state.hand.el.parentNode.removeChild(state.hand.el);
    state.hand = null;
    syncHoldingUi();

    state.slots = [];
    var r, c;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var slotEl = document.createElement("button");
        slotEl.type = "button";
        slotEl.className = "vc-puzzle-slot vc-puzzle-slot--empty";
        slotEl.dataset.row = String(r);
        slotEl.dataset.col = String(c);
        var sid = r + "-" + c;
        slotEl.dataset.slotId = sid;
        slotEl.setAttribute("aria-label", "Slot " + (r + 1) + "," + (c + 1));
        var slot = { el: slotEl, row: r, col: c, id: sid, pieceId: null };
        slotEl.addEventListener(
          "click",
          (function (s) {
            return function () {
              onSlotClick(s);
            };
          })(slot)
        );
        els.board.appendChild(slotEl);
        state.slots.push(slot);
      }
    }

    state.edges = makeEdges();
    state.pieces = [];
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var id = r + "-" + c;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vc-puzzle-piece";
        btn.setAttribute("aria-label", "Pezzo");
        btn.dataset.pieceId = id;
        var canvas = document.createElement("canvas");
        btn.appendChild(canvas);
        var piece = {
          id: id,
          row: r,
          col: c,
          edges: edgesFor(r, c, state.edges),
          el: btn,
          canvas: canvas,
          tokenEl: null,
          home: "tray",
          seen: false,
        };
        (function (p) {
          btn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            onPieceClick(p);
          });
        })(piece);
        state.pieces.push(piece);
        makeToken(piece);
      }
    }

    shuffle(state.pieces).forEach(function (p) {
      putTokenInTray(p);
    });
  }

  function drawRandom(clientX, clientY) {
    var pool = trayPieces();
    if (!pool.length) return;
    /* preferisci ancora coperti; se tutti visti, pesca a caso */
    var covered = pool.filter(function (p) {
      return !p.seen;
    });
    var pickFrom = covered.length ? covered : pool;
    var piece = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    drawPiece(piece, clientX, clientY);
  }

  function drawPiece(piece, clientX, clientY) {
    if (state.complete || !piece || piece.home !== "tray") return;
    if (state.hand) {
      /* secondo click vassoio: rimetti e prendi questo */
      returnHandToTray();
    }
    if (piece.home !== "tray") return;

    clearTokenRemoveTimer(piece);
    var tok = piece.tokenEl;
    if (tok && tok.parentNode) {
      tok.classList.add("is-drawing");
      tok.parentNode.removeChild(tok);
      piece._tokenRemoveTimer = window.setTimeout(function () {
        tok.classList.remove("is-drawing");
        piece._tokenRemoveTimer = 0;
      }, 280);
    }

    piece.seen = true;
    piece.home = "hand";
    state.hand = piece;
    piece.el.classList.remove("is-placed", "is-locked", "is-wrong", "is-settled");
    piece.el.classList.add("is-floating");
    piece.el.style.filter = "";
    renderPieceCanvas(piece, state.pieceW, state.pieceH);
    document.body.appendChild(piece.el);

    var x = clientX != null ? clientX : state.pointerX || window.innerWidth / 2;
    var y = clientY != null ? clientY : state.pointerY || window.innerHeight / 2;
    piece.el.style.animation = "none";
    void piece.el.offsetWidth;
    piece.el.style.animation = "";
    moveFloating(x, y);
    syncHoldingUi();
    updateProgress();
  }

  function returnHandToTray() {
    if (!state.hand) return;
    var piece = state.hand;
    piece.el.classList.remove("is-floating");
    state.hand = null;
    putTokenInTray(piece);
    syncHoldingUi();
    updateProgress();
  }

  function detachFromSlot(piece) {
    state.slots.forEach(function (s) {
      if (s.pieceId === piece.id) {
        s.pieceId = null;
        s.el.classList.add("vc-puzzle-slot--empty");
        s.el.innerHTML = "";
      }
    });
    delete state.placed[piece.id];
  }

  function placePieceInSlot(piece, slot) {
    if (slot.pieceId && slot.pieceId !== piece.id) {
      var other = state.pieces.find(function (p) {
        return p.id === slot.pieceId;
      });
      if (other && !other.el.classList.contains("is-locked")) {
        detachFromSlot(other);
        putTokenInTray(other);
      } else if (other) {
        return;
      }
    }

    detachFromSlot(piece);
    slot.pieceId = piece.id;
    slot.el.classList.remove("vc-puzzle-slot--empty");
    piece.home = "slot:" + slot.id;
    piece.el.classList.remove("is-floating");
    piece.el.style.left = "";
    piece.el.style.top = "";
    piece.el.style.animation = "";
    piece.el.classList.add("is-placed");
    renderPieceCanvas(piece, state.pieceW, state.pieceH);
    slot.el.appendChild(piece.el);

    var ok = piece.id === slot.id;
    if (ok) {
      state.placed[piece.id] = piece.id;
      piece.el.classList.remove("is-wrong", "is-settled");
      piece.el.classList.add("is-locked");
      piece.el.style.animation = "none";
      void piece.el.offsetWidth;
      piece.el.style.animation = "";
      flashSlotOk(slot);
      /* glow verde poi sparisce */
      window.setTimeout(function () {
        if (piece.el.classList.contains("is-locked")) piece.el.classList.add("is-settled");
      }, 900);
    } else {
      delete state.placed[piece.id];
      piece.el.classList.remove("is-locked", "is-settled");
      piece.el.classList.add("is-wrong");
      piece.el.style.animation = "";
      piece.el.style.filter = "";
    }

    if (state.hand === piece) state.hand = null;
    syncHoldingUi();
    updateProgress();
  }

  function onSlotClick(slot) {
    if (state.complete) return;
    if (state.hand) {
      placePieceInSlot(state.hand, slot);
      return;
    }
    if (slot.pieceId) {
      var p = state.pieces.find(function (x) {
        return x.id === slot.pieceId;
      });
      if (p && p.el.classList.contains("is-wrong")) {
        detachFromSlot(p);
        putTokenInTray(p);
        updateProgress();
      }
    }
  }

  function onPieceClick(piece) {
    if (state.complete || piece.el.classList.contains("is-locked")) return;
    if (piece.el.classList.contains("is-wrong")) {
      detachFromSlot(piece);
      putTokenInTray(piece);
      updateProgress();
    }
  }

  function stopConfetti() {
    if (state.confettiRaf) {
      cancelAnimationFrame(state.confettiRaf);
      state.confettiRaf = 0;
    }
    if (els.confetti) {
      els.confetti.hidden = true;
      var ctx = els.confetti.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, els.confetti.width, els.confetti.height);
    }
  }

  function startConfetti() {
    if (!els.confetti) return;
    stopConfetti();
    var canvas = els.confetti;
    canvas.hidden = false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var colors = ["#d4a888", "#6dcf8a", "#f0e2cf", "#e07a6a", "#8ec5ff", "#f6c945", "#ffffff", "#c9a0ff"];
    var parts = [];
    var cannons = [
      { x: 28, y: h - 12, base: -Math.PI * 0.72, spread: 0.55 }, /* basso sx → su/destra */
      { x: w - 28, y: h - 12, base: -Math.PI * 0.28, spread: 0.55 }, /* basso dx → su/sinistra */
    ];

    function spawnBurst(count, powerScale) {
      var c, n, ang, spd, side;
      for (c = 0; c < cannons.length; c++) {
        side = cannons[c];
        for (n = 0; n < count; n++) {
          ang = side.base + (Math.random() - 0.5) * side.spread;
          spd = (9.5 + Math.random() * 11) * (powerScale || 1);
          parts.push({
            x: side.x + (Math.random() - 0.5) * 10,
            y: side.y + (Math.random() - 0.5) * 8,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            g: 0.16 + Math.random() * 0.08,
            drag: 0.992 + Math.random() * 0.004,
            w: 3 + Math.random() * 5,
            hh: 7 + Math.random() * 10,
            rot: Math.random() * Math.PI * 2,
            vr: (-0.35 + Math.random() * 0.7),
            color: colors[(parts.length + n) % colors.length],
            born: 0,
            kind: Math.random() < 0.35 ? "rect" : "strip",
          });
        }
      }
    }

    /* salva iniziale abbondante + raffiche */
    spawnBurst(70, 1.15);
    spawnBurst(55, 1);
    var start = performance.now();
    var nextBurst = 0.18;
    var burstN = 0;

    function frame(now) {
      var t = (now - start) / 1000;
      while (burstN < 10 && t >= nextBurst) {
        spawnBurst(38 + Math.floor(Math.random() * 22), 0.92 + Math.random() * 0.25);
        burstN += 1;
        nextBurst += 0.16 + Math.random() * 0.1;
      }

      ctx.clearRect(0, 0, w, h);

      /* coni / bocche dei cannoni */
      var ci;
      for (ci = 0; ci < cannons.length; ci++) {
        var gun = cannons[ci];
        var left = ci === 0;
        ctx.save();
        ctx.translate(gun.x, gun.y);
        ctx.rotate(left ? -0.55 : 0.55);
        ctx.fillStyle = "rgba(212,168,136,0.55)";
        ctx.beginPath();
        ctx.moveTo(-7, 10);
        ctx.lineTo(7, 10);
        ctx.lineTo(3, -18);
        ctx.lineTo(-3, -18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,240,220,0.35)";
        ctx.fillRect(-2.5, -22, 5, 8);
        ctx.restore();
      }

      var alive = 0;
      var i;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.born === 0) p.born = t;
        var age = t - p.born;
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < h + 60 && age < 3.8 && p.x > -80 && p.x < w + 80) {
          alive++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2.4) / 1.4);
          ctx.fillStyle = p.color;
          if (p.kind === "strip") {
            ctx.fillRect(-p.w * 0.35, -p.hh / 2, p.w * 0.7, p.hh);
          } else {
            ctx.fillRect(-p.w / 2, -p.hh * 0.35, p.w, p.hh * 0.7);
          }
          ctx.restore();
        }
      }
      if ((alive > 0 || burstN < 10) && t < 5.2) {
        state.confettiRaf = requestAnimationFrame(frame);
      } else {
        stopConfetti();
      }
    }
    state.confettiRaf = requestAnimationFrame(frame);
  }

  function reshuffle() {
    state.complete = false;
    stopConfetti();
    if (state.hand) {
      state.hand.el.classList.remove("is-floating");
      putTokenInTray(state.hand);
      state.hand = null;
    }
    if (els.board) els.board.classList.remove("is-complete");
    if (els.done) els.done.hidden = true;
    clearBoardSlots();
    state.edges = makeEdges();
    state.pieces.forEach(function (p) {
      p.edges = edgesFor(p.row, p.col, state.edges);
      p.seen = false;
      clearTokenRemoveTimer(p);
      p.el.classList.remove("is-locked", "is-placed", "is-wrong", "is-floating", "is-settled");
      p.el.style.left = "";
      p.el.style.top = "";
      p.el.style.animation = "";
      p.el.style.filter = "";
    });
    els.tray.innerHTML = "";
    shuffle(state.pieces).forEach(function (p) {
      putTokenInTray(p);
    });
    syncHoldingUi();
    layoutBoard();
    updateProgress();
  }

  function loadImage() {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () {
        state.img = img;
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Immagine puzzle non caricata"));
      };
      img.src = IMG_SRC;
    });
  }

  function revealPage() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-page-cine-ready", "vc-staff-app-revealed", "vc-cine-curtain-off");
      root.classList.remove(
        "vc-page-cine-boot",
        "vc-staff-access-pending",
        "vc-loader-blocking-live",
        "vc-loading-scroll-lock",
        "vc-interaction-hold"
      );
      if (document.body) {
        document.body.classList.add("vc-staff-app-revealed");
        document.body.style.pointerEvents = "auto";
      }
    } catch (eRev) {}
    var loading = $("vc-staff-loading");
    if (loading) {
      loading.hidden = true;
      loading.setAttribute("hidden", "");
      loading.classList.add("vc-staff-loading--hidden");
      loading.style.display = "none";
    }
    var curtain = $("vc-cine-boot-curtain");
    if (curtain) {
      curtain.hidden = true;
      curtain.setAttribute("hidden", "");
      curtain.style.display = "none";
      curtain.style.pointerEvents = "none";
    }
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
  }

  function bindPointerFollow() {
    window.addEventListener(
      "pointermove",
      function (ev) {
        moveFloating(ev.clientX, ev.clientY);
      },
      { passive: true }
    );
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && state.hand) returnHandToTray();
    });
  }

  function initPuzzle() {
    if (state.ready) return;
    els.board = $("vc-puzzle-board");
    els.boardWrap = $("vc-puzzle-board-wrap");
    els.tray = $("vc-puzzle-tray");
    els.trayWrap = $("vc-puzzle-tray-wrap");
    els.trayLabel = $("vc-puzzle-tray-label");
    els.floatHint = $("vc-puzzle-float-hint");
    els.confetti = $("vc-puzzle-confetti");
    els.progress = $("vc-puzzle-progress");
    els.done = $("vc-puzzle-done");
    els.reshuffle = $("vc-puzzle-reshuffle");
    els.again = $("vc-puzzle-again");
    if (!els.board || !els.tray) return;

    state.ready = true;

    loadImage()
      .then(function () {
        buildDom();
        layoutBoard();
        updateProgress();
        bindPointerFollow();
        if (els.trayWrap) {
          els.trayWrap.addEventListener("click", function (ev) {
            drawRandom(ev.clientX, ev.clientY);
          });
        }
        if (els.reshuffle) els.reshuffle.addEventListener("click", reshuffle);
        if (els.again) {
          els.again.addEventListener("click", function () {
            stopConfetti();
            reshuffle();
          });
        }
        window.addEventListener(
          "resize",
          (function () {
            var t = 0;
            return function () {
              clearTimeout(t);
              t = setTimeout(layoutBoard, 100);
            };
          })()
        );
      })
      .catch(function (err) {
        if (els.progress) els.progress.textContent = "Errore immagine";
        console.error(err);
      });
  }

  function onAccessOk() {
    revealPage();
    initPuzzle();
  }

  function permsAllow(d) {
    d = d || {};
    return Boolean(d.isHighStaff || d.canManage || d.highStaff);
  }

  function tryStartFromPerms(d) {
    if (state.ready) {
      revealPage();
      return;
    }
    if (permsAllow(d)) onAccessOk();
  }

  function boot() {
    els.app = $("vc-puzzle-app");
    function pull() {
      tryStartFromPerms(window.__VC_STAFF_PERMS || window.__VC_ACCESS_PERMS);
    }
    pull();
    window.addEventListener("vc:staff-access-ok", function (ev) {
      tryStartFromPerms((ev && ev.detail) || window.__VC_STAFF_PERMS || {});
    });
    window.addEventListener("vc:access-ok", function (ev) {
      var detail = (ev && ev.detail) || {};
      tryStartFromPerms(detail.perms || window.__VC_ACCESS_PERMS || window.__VC_STAFF_PERMS || {});
    });
    var n = 0;
    var iv = window.setInterval(function () {
      n += 1;
      pull();
      if (state.ready || n > 50) window.clearInterval(iv);
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
