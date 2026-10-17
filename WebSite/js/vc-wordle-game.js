/*! 20261014wordleItCurated1 — Wordle interattivo (griglia + tastiera) */
(function () {
  if (window.__vcWordleGame) return;
  window.__vcWordleGame = "20261014wordleItCurated1";

  var API_TODAY = "/webhooks/site-wordle/today";
  var API_GUESS = "/webhooks/site-wordle/guess";
  var ROWS = 6;
  var COLS = 5;
  var KB = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

  var state = {
    lang: "it",
    day: "",
    row: 0,
    col: 0,
    board: [],
    current: "",
    done: false,
    won: false,
    lost: false,
    answer: "",
    keyMarks: Object.create(null),
    busy: false,
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function storageKey() {
    /* itAnswersApiPollute1: v2 invalida partite IT salvate con risposta EN (dance) */
    return "vc_wordle_v2:" + state.lang + ":" + (state.day || "na");
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(storageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(
        storageKey(),
        JSON.stringify({
          day: state.day,
          lang: state.lang,
          board: state.board,
          done: state.done,
          won: state.won,
          lost: state.lost,
          answer: state.answer || "",
          keyMarks: state.keyMarks,
        }),
      );
    } catch (e) {}
  }

  function toast(msg) {
    var el = $("#wdl-toast");
    if (!el) return;
    el.textContent = String(msg || "");
    el.classList.add("is-on");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () {
      el.classList.remove("is-on");
    }, 1600);
  }

  function markClass(m) {
    if (m === "g") return "is-correct";
    if (m === "y") return "is-present";
    return "is-absent";
  }

  function upgradeKey(ch, m) {
    var cur = state.keyMarks[ch];
    var rank = { b: 1, y: 2, g: 3 };
    if (!cur || (rank[m] || 0) > (rank[cur] || 0)) state.keyMarks[ch] = m;
  }

  function renderBoard() {
    var root = $("#wdl-board");
    if (!root) return;
    root.innerHTML = "";
    for (var r = 0; r < ROWS; r++) {
      var row = document.createElement("div");
      row.className = "wdl-row";
      var entry = state.board[r];
      for (var c = 0; c < COLS; c++) {
        var tile = document.createElement("div");
        tile.className = "wdl-tile";
        var letter = "";
        if (entry && entry.guess) {
          letter = entry.guess.charAt(c) || "";
          var m = entry.marks && entry.marks[c];
          if (m) tile.classList.add(markClass(m), "is-reveal");
          else if (letter) tile.classList.add("is-filled");
        } else if (r === state.row && !state.done) {
          letter = state.current.charAt(c) || "";
          if (letter) tile.classList.add("is-filled");
        }
        tile.textContent = letter;
        row.appendChild(tile);
      }
      root.appendChild(row);
    }
  }

  function renderKeys() {
    var root = $("#wdl-keyboard");
    if (!root) return;
    root.innerHTML = "";
    KB.forEach(function (line, idx) {
      var row = document.createElement("div");
      row.className = "wdl-kb-row";
      if (idx === 2) {
        var enter = document.createElement("button");
        enter.type = "button";
        enter.className = "wdl-key is-wide";
        enter.dataset.key = "Enter";
        enter.textContent = "Invio";
        row.appendChild(enter);
      }
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wdl-key";
        btn.dataset.key = ch;
        btn.textContent = ch;
        var km = state.keyMarks[ch];
        if (km) btn.classList.add(markClass(km));
        row.appendChild(btn);
      }
      if (idx === 2) {
        var back = document.createElement("button");
        back.type = "button";
        back.className = "wdl-key is-wide";
        back.dataset.key = "Backspace";
        back.textContent = "⌫";
        row.appendChild(back);
      }
      root.appendChild(row);
    });
  }

  function renderMeta() {
    var meta = $("#wdl-meta");
    if (!meta) return;
    var day = state.day || "—";
    var n = state.board.length;
    if (state.won) meta.textContent = "Vinto in " + n + "/" + ROWS + " · " + day;
    else if (state.lost) meta.textContent = "Perso · parola: " + (state.answer || "?") + " · " + day;
    else meta.textContent = "Tentativo " + n + "/" + ROWS + " · " + day;
    document.querySelectorAll(".wdl-lang").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-lang") === state.lang);
    });
  }

  function paint() {
    renderBoard();
    renderKeys();
    renderMeta();
  }

  function typeLetter(ch) {
    if (state.done || state.busy) return;
    ch = String(ch || "").toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
    if (state.current.length >= COLS) return;
    state.current += ch;
    paint();
  }

  function backspace() {
    if (state.done || state.busy) return;
    state.current = state.current.slice(0, -1);
    paint();
  }

  async function submit() {
    if (state.done || state.busy) return;
    if (state.current.length !== COLS) {
      toast("Servono 5 lettere");
      return;
    }
    state.busy = true;
    try {
      var history = state.board.map(function (r) {
        return String(r.guess || "").toLowerCase();
      });
      var res = await fetch(API_GUESS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ lang: state.lang, guess: state.current, history: history }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!data || data.ok !== true) {
        toast((data && data.message) || "Parola non valida");
        return;
      }
      var guess = String(data.guess || state.current).toUpperCase();
      var marks = Array.isArray(data.marks) ? data.marks : [];
      state.board.push({ guess: guess, marks: marks });
      for (var i = 0; i < COLS; i++) {
        upgradeKey(guess.charAt(i).toLowerCase(), marks[i] || "b");
      }
      state.current = "";
      state.row = state.board.length;
      state.won = Boolean(data.won);
      state.lost = Boolean(data.lost);
      state.done = Boolean(data.done);
      if (data.answer) state.answer = String(data.answer);
      saveLocal();
      paint();
      if (state.won) toast("Bravo!");
      else if (state.lost) toast("Era " + state.answer);
    } catch (e) {
      toast("Rete occupata, riprova");
    } finally {
      state.busy = false;
    }
  }

  function onKey(key) {
    if (key === "Enter") return submit();
    if (key === "Backspace") return backspace();
    typeLetter(key);
  }

  async function boot(lang) {
    state.lang = lang === "en" ? "en" : "it";
    state.board = [];
    state.current = "";
    state.row = 0;
    state.done = false;
    state.won = false;
    state.lost = false;
    state.answer = "";
    state.keyMarks = Object.create(null);
    try {
      var res = await fetch(API_TODAY + "?lang=" + encodeURIComponent(state.lang), {
        credentials: "omit",
        cache: "no-store",
      });
      var data = await res.json();
      if (data && data.ok) state.day = String(data.day || "");
    } catch (e) {
      state.day = new Date().toISOString().slice(0, 10);
    }
    var saved = loadLocal();
    if (saved && saved.day === state.day && Array.isArray(saved.board)) {
      state.board = saved.board;
      state.row = saved.board.length;
      state.done = Boolean(saved.done);
      state.won = Boolean(saved.won);
      state.lost = Boolean(saved.lost);
      state.answer = String(saved.answer || "");
      state.keyMarks = saved.keyMarks || Object.create(null);
    }
    paint();
  }

  function wire() {
    document.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        onKey("Enter");
        return;
      }
      if (ev.key === "Backspace") {
        ev.preventDefault();
        onKey("Backspace");
        return;
      }
      if (/^[a-zA-Z]$/.test(ev.key)) {
        ev.preventDefault();
        onKey(ev.key.toLowerCase());
      }
    });
    var kb = $("#wdl-keyboard");
    if (kb) {
      kb.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-key]") : null;
        if (!btn) return;
        onKey(btn.getAttribute("data-key"));
      });
    }
    document.querySelectorAll(".wdl-lang").forEach(function (btn) {
      btn.addEventListener("click", function () {
        boot(btn.getAttribute("data-lang") || "it");
      });
    });
  }

  function start() {
    wire();
    var q = "";
    try {
      q = new URLSearchParams(location.search).get("lang") || "";
    } catch (e) {}
    boot(q === "en" ? "en" : "it");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
