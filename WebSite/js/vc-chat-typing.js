/**
 * Shared Discord-like typing indicator helpers for tickets + workflow chat.
 * vcChatTyping1
 */
(function (global) {
  "use strict";

  var TTL_MS = 4500;

  function formatTypingLabel(rows) {
    var names = (rows || [])
      .map(function (r) {
        return String((r && (r.userName || r.name)) || "").trim();
      })
      .filter(Boolean);
    if (!names.length) return "";
    if (names.length === 1) return names[0] + " sta scrivendo…";
    if (names.length === 2) return names[0] + " e " + names[1] + " stanno scrivendo…";
    return "Più persone stanno scrivendo…";
  }

  function TypingRoom(opts) {
    this.selfId = String((opts && opts.selfId) || "").trim();
    this.map = Object.create(null);
    this.timer = null;
    this.lastSent = 0;
    this.minInterval = Math.max(1200, Number((opts && opts.minInterval) || 2000));
    this.onChange = typeof (opts && opts.onChange) === "function" ? opts.onChange : function () {};
    this.sendFn = typeof (opts && opts.sendFn) === "function" ? opts.sendFn : null;
  }

  TypingRoom.prototype.note = function (userId, userName) {
    var uid = String(userId || "").trim();
    if (!uid || (this.selfId && uid === this.selfId)) return;
    this.map[uid] = {
      userId: uid,
      userName: String(userName || "Utente").trim() || "Utente",
      at: Date.now(),
    };
    this.scheduleExpire();
    this.onChange(this.list());
  };

  TypingRoom.prototype.clearUser = function (userId) {
    var uid = String(userId || "").trim();
    if (uid && this.map[uid]) {
      delete this.map[uid];
      this.onChange(this.list());
    }
  };

  TypingRoom.prototype.reset = function () {
    this.map = Object.create(null);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onChange([]);
  };

  TypingRoom.prototype.list = function () {
    var now = Date.now();
    var out = [];
    Object.keys(this.map).forEach(
      function (uid) {
        var row = this.map[uid];
        if (!row || now - Number(row.at || 0) > TTL_MS) {
          delete this.map[uid];
          return;
        }
        out.push(row);
      }.bind(this),
    );
    out.sort(function (a, b) {
      return a.at - b.at;
    });
    return out;
  };

  TypingRoom.prototype.scheduleExpire = function () {
    var self = this;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(function () {
      self.timer = null;
      self.onChange(self.list());
      if (Object.keys(self.map).length) self.scheduleExpire();
    }, 900);
  };

  TypingRoom.prototype.pulse = function (hasText) {
    if (!this.sendFn) return;
    if (!hasText) {
      if (Date.now() - this.lastSent < 8000) {
        this.lastSent = 0;
        try {
          this.sendFn({ stop: true });
        } catch (e0) {}
      }
      return;
    }
    var now = Date.now();
    if (now - this.lastSent < this.minInterval) return;
    this.lastSent = now;
    try {
      this.sendFn({ stop: false });
    } catch (e1) {}
  };

  TypingRoom.prototype.renderInto = function (el) {
    if (!el) return;
    var label = formatTypingLabel(this.list());
    if (!label) {
      el.hidden = true;
      el.textContent = "";
      el.setAttribute("aria-hidden", "true");
      return;
    }
    el.hidden = false;
    el.removeAttribute("aria-hidden");
    el.innerHTML =
      '<span class="vc-chat-typing__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="vc-chat-typing__text">' +
      label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      "</span>";
  };

  global.VcChatTyping = {
    TTL_MS: TTL_MS,
    formatTypingLabel: formatTypingLabel,
    TypingRoom: TypingRoom,
  };
})(typeof window !== "undefined" ? window : globalThis);
