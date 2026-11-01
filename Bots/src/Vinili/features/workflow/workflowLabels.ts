/** Workflow staff: settimane, stati ed etichette (resoconti e pause). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { formatPauseRoleLabelForMessage, normalizePauseRoleChoice } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");

const RESOCONTO_LIST_ROLE_RANK = new Map(
  [
    IDs.roles.PartnerManager,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
  ]
    .filter(Boolean)
    .map((roleId?, index?) => [String(roleId), index]),
);
const RESOCONTO_LIST_RANK_FALLBACK = 50;

function stripDiscordDecorations(text?, opts: Record<string, any> = {}) {
  const keepNewlines = Boolean(opts?.keepNewlines);
  const keepCustomEmoji = Boolean(opts?.keepCustomEmoji);
  let s = String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
        .replace(/[\u200B\u200C\uFEFF]/g, "");
  const emojiTokens = [];
  if (keepCustomEmoji) {
    s = s.replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = emojiTokens.length;
      emojiTokens.push(m);
      return `{{VCEMOJI${i}}}`;
    });
  } else {
    s = s.replace(/<a?:[\w~-]+:\d+>/g, "");
  }
  s = s
    .replace(/<(?:@(?:!|&)?|#)\d+>/g, "")
        .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/```[\s\S]*?```/g, (block?) =>
      block.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""),
    )
    .replace(/\[([^\]]+)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\|\|(.+?)\|\|/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[*_`~|]+/g, "");
  if (emojiTokens.length) {
    for (let i = 0; i < emojiTokens.length; i += 1) {
      s = s.split(`{{VCEMOJI${i}}}`).join(emojiTokens[i]);
    }
  }
  if (keepNewlines) {
    return s
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

function weekKeyFromDate(input?) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      weekday: "short",
    }).format(d);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const offset = map[wd] ?? 0;
    const [y, m, day] = ymd.split("-").map((n?) => Number(n));
    const sunday = new Date(Date.UTC(y, m - 1, day - offset));
    const sy = sunday.getUTCFullYear();
    const sm = String(sunday.getUTCMonth() + 1).padStart(2, "0");
    const sd = String(sunday.getUTCDate()).padStart(2, "0");
    return `${sy}-${sm}-${sd}`;
  } catch {
    return "";
  }
}

function formatWeekLabel(weekKey?) {
  const raw = String(weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "Settimana";
    const [y, m, d] = raw.split("-").map((n?) => Number(n));
  const end = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, m - 1, d - 6));
  const fmt = (dt?) =>
    `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}/${String(end.getUTCFullYear()).slice(2)}`;
}

function buildWorkflowDedupeKey(queue?, parts?) {
  const q = String(queue || "").trim().toLowerCase();
  return `${q}:${parts.filter(Boolean).join(":")}`;
}

function normalizeStatus(raw?, fallback = "pending") {
  const s = String(raw || fallback).trim().toLowerCase();
  if (["pending", "accepted", "rejected", "closed", "cancelled"].includes(s)) return s;
  return fallback;
}

function statusLabelFor(status?, pauseLabel?) {
  const st = String(status || "").toLowerCase();
  const stored = String(pauseLabel || "").trim();
    if (stored) {
    if (st === "pending") return stored;
    if (st === "accepted" && /^(programmata|in corso|finita|accettata)$/i.test(stored)) return stored;
    if (st === "cancelled" && !/^richiesta$/i.test(stored)) return stored;
    if (st === "rejected" && /^rifiutata$/i.test(stored)) return stored;
  }
  const map = {
    pending: "In attesa",
    accepted: "Accettata",
    rejected: "Rifiutata",
    closed: "Chiusa",
    cancelled: "Annullata",
  };
  return map[st] || status;
}

function pauseTrackRoleKey(pauseOrFields?) {
  const raw =
    pauseOrFields?.ruoloTrack ??
    pauseOrFields?.ruoloRichiesto ??
    pauseOrFields?.ruolo ??
    (typeof pauseOrFields === "string" ? pauseOrFields : "");
  const normalized = normalizePauseRoleChoice(raw);
  if (normalized) return normalized;
  const label = String(pauseOrFields?.ruoloLabel || raw || "")
    .trim()
    .toLowerCase();
  if (/partner\s*manager|\bpm\b/.test(label)) return "PartnerManager";
  if (/entrambi|\bboth\b/.test(label)) return "Entrambi";
    return "Staff";
}

function cleanPauseSubjectDisplayName(name?, userId?) {
  let n = stripDiscordDecorations(String(name || "")).trim();
  n = n
    .replace(/\s*[|/·\-–—]\s*sono in pausa!?/gi, "")
    .replace(/\s*sono in pausa!?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
    if (!n || /^[\s\u115f\u1160\u200b\u200c\u200d\u2060\u3164\ufeff\uffa0áƒ¦á²¼]+$/iu.test(n)) {
    return "";
  }
  if (isSnowflakeLikeLabel(n, userId)) return "";
  return n;
}

function pauseRoleDisplayLabel(trackOrFields?, member?, guild = null) {
  const track = pauseTrackRoleKey(trackOrFields);
  const g = guild || member?.guild || null;
  const labeled =
    trackOrFields && typeof trackOrFields === "object"
      ? String(trackOrFields.ruoloLabel || "").trim()
      : "";
  /* pauseBothRoles1: Entrambi non deve collassare sul solo grado staff (es. Moderator) */
  if (track === "Entrambi") {
    try {
      if (member) return formatPauseRoleLabelForMessage(g, "Entrambi", member);
    } catch (_) {}
    if (labeled && !/entrambi|\bboth\b|partner\s*manager/i.test(labeled)) {
      const pmRole = g?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
      const pmLabel = pmRole?.name || "Partner Manager";
      return `${labeled} e ${pmLabel}`;
    }
    try {
      return formatPauseRoleLabelForMessage(g, "Entrambi", member);
    } catch (_) {
      return "Entrambi";
    }
  }
  if (labeled && !/^(staff|partnermanager|partner manager|entrambi|both)$/i.test(labeled)) {
    return labeled;
  }
  try {
    return formatPauseRoleLabelForMessage(g, track, member);
  } catch (_) {
    return track === "PartnerManager" ? "Partner Manager" : (track as any) === "Entrambi" ? "Entrambi" : "Staff";
  }
}

const RESOCONTO_ACTION_LABELS = {
  vp: "Valutazione positiva",
  vn: "Valutazione negativa",
  nl: "Nulla",
  px: "Pex",
  dp: "Depex",
  rc: "Richiamo",
  batch: "Azioni multiple",
};

const GENERIC_RESOCONTO_STATUS_LABELS = new Set([
  "accettata",
  "rifiutata",
  "chiusa",
  "in attesa",
  "annullata",
  "annullato (depex)",
]);

function resocontoActionLabelForKey(raw?) {
  const k = String(raw || "").trim().toLowerCase();
  return RESOCONTO_ACTION_LABELS[k] || "";
}

function extractResocontoAzioneText(content?) {
  const raw = String(content || "");
  const m =
    raw.match(/\*\*Azione:\*\*\s*__([\s\S]*?)__/i) ||
    raw.match(/Azione:\s*__([^_\n]+)__/i) ||
    raw.match(/\*\*Azione:\*\*\s*([^\n]+)/i) ||
    raw.match(/Azione:\s*([^\n]+)/i);
  if (!m) return "";
  return stripDiscordDecorations(m[1] || "", { keepCustomEmoji: false }).trim();
}

function formatResocontoProposedLabel(azioneRaw?, actionKey?) {
  const azione = String(azioneRaw || "").trim();
  if (azione) {
    if (/^nulla\b/i.test(azione)) {
            const dash = azione.match(/^nulla\s*[—–-]\s*(.+)$/i);
      if (dash && dash[1]) return `Nulla — ${String(dash[1]).trim()}`.slice(0, 48);
      return "Nulla";
    }
    const hasPos = /valutazione positiva|compito sanzioni/i.test(azione);
    const hasNeg = /valutazione negativa/i.test(azione);
    const gia = /gi[aà]\s*registrat/i.test(azione);
    if (hasPos || hasNeg) {
      let label = "Azioni multiple";
      if (hasPos && hasNeg) label = "Valutazione positiva / negativa";
      else if (hasPos) label = "Valutazione positiva";
      else label = "Valutazione negativa";
      if (gia) label += hasPos && hasNeg ? " (già fatte)" : " (già fatta)";
      return label;
    }
    const fromAzione = normalizeResocontoActionKey(azione);
    if (fromAzione) return resocontoActionLabelForKey(fromAzione) || azione.slice(0, 48);
    return azione.slice(0, 48);
  }
  return resocontoActionLabelForKey(actionKey) || "";
}

function formatVoiceHoursForPreview(sec?) {
  const s = Math.max(0, Number(sec) || 0);
  const h = s / 3600;
  if (h >= 10) return `${h.toFixed(1).replace(/\.0$/, "")}h`;
  return `${h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}h`;
}

function buildResocontoInboxPreview(
  content?,
  {
    kind = "",
    proposedLabel = "",
    weeklyMessages = null,
    weeklyVoiceSeconds = null,
    weeklyPartners = null,
  } = {},
) {
  const plain = stripDiscordDecorations(content || "", { keepNewlines: true, keepCustomEmoji: false })
    .replace(/:[a-zA-Z0-9_~-]+:/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F|\u200D/g, "");
  const fields = parseResocontoBodyFields(plain);
  let msgs =
    weeklyMessages != null && Number.isFinite(Number(weeklyMessages))
      ? Math.max(0, Math.floor(Number(weeklyMessages)))
      : null;
  let ore =
    weeklyVoiceSeconds != null && Number.isFinite(Number(weeklyVoiceSeconds))
      ? formatVoiceHoursForPreview(weeklyVoiceSeconds)
      : "";
  let sanzioni = "";
  let partners =
    weeklyPartners != null && Number.isFinite(Number(weeklyPartners))
      ? Math.max(0, Math.floor(Number(weeklyPartners)))
      : null;
  let azione = String(proposedLabel || "").trim();
  for (const f of fields) {
    const key = stripDiscordDecorations(f?.name || "", { keepCustomEmoji: false })
      .trim()
      .toLowerCase();
    const value = stripDiscordDecorations(f?.value || "", { keepCustomEmoji: false }).trim();
    if (/^azione$/.test(key) && !azione) azione = formatResocontoProposedLabel(value, "") || value;
    else if (/messaggi/.test(key) && msgs == null) {
      const n = value.replace(/[^\d]/g, "");
      if (n) msgs = Number(n);
    } else if ((/^ore\b/.test(key) || /ore in una settimana/.test(key)) && !ore) {
      const m = value.match(/(\d+(?:[.,]\d+)?)\s*h\b/i);
      if (m) ore = `${String(m[1]).replace(",", ".")}h`;
      else {
        const only = value.replace(/[^\d.,]/g, "");
        if (only) ore = `${only.replace(",", ".")}h`;
      }
    } else if (/sanzioni/.test(key)) sanzioni = value;
    else if (/^partner$/.test(key) && partners == null) {
      const n = value.replace(/[^\d]/g, "");
      if (n) partners = Number(n);
    }
  }
  const parts = [];
  if (String(kind || "").toLowerCase() === "p") {
    if (partners != null) parts.push(`${partners} partner`);
    if (azione) parts.push(azione);
    return parts.join(" · ").slice(0, 180);
  }
  if (msgs != null) parts.push(`${msgs} msg`);
  if (ore) parts.push(ore);
  if (sanzioni) parts.push(`Sanzioni ${sanzioni}`);
  if (azione) parts.push(azione);
  return parts.join(" · ").slice(0, 180);
}

function deriveResocontoStaffFlags(content?, { azioneText = "", workflowFields = null } = {}) {
  const wf =
    workflowFields && typeof workflowFields === "object" && !Array.isArray(workflowFields)
      ? workflowFields
      : {};
  const plain = stripDiscordDecorations(String(content || ""), {
    keepNewlines: true,
    keepCustomEmoji: false,
  }).toLowerCase();
  const azione = stripDiscordDecorations(String(azioneText || extractResocontoAzioneText(content) || ""), {
    keepCustomEmoji: false,
  }).toLowerCase();
  let isNew =
    wf.isNewStaff === true ||
    wf.graceNewStaff === true ||
    /nuovo in staff|nuovo partner manager|nuovo\s*pm\b/.test(azione) ||
    /nuovo in staff|nuovo partner manager/.test(plain);
  let inPause =
    wf.inPause === true ||
    wf.currentlyInPause === true ||
    /\bin pausa\b|pausa nella settimana/.test(azione) ||
    /\bin pausa\b/.test(plain);
  const pauseEnded =
    wf.pauseEnded === true || /rientrato da pausa/.test(azione) || /rientrato da pausa/.test(plain);
  let pauseNote = "";
  const pauseMatch =
    String(content || "").match(/\*\*In pausa\*\*[^\n]*/i) ||
    String(content || "").match(/In pausa[^\n]*/i);
  if (pauseMatch) {
    pauseNote = stripDiscordDecorations(pauseMatch[0], { keepCustomEmoji: false }).trim();
        if (!pauseEnded) inPause = true;
  }
  return {
    isNewStaff: Boolean(isNew),
    inPause: Boolean(inPause),
    pauseEnded: Boolean(pauseEnded && !inPause),
    pauseNote: pauseNote.slice(0, 120),
  };
}

function parseResocontoOutcomeFromContent(text?) {
  const raw = String(text || "");
  if (/azione negata da/i.test(raw)) {
    return { rejected: true, actionKey: "", label: "Azione negata" };
  }
  const confirmMatch = raw.match(/azione confermata da[\s\S]*?:([\s\S]*?)(?:\n\n|$)/i);
  const outcomeText = confirmMatch ? String(confirmMatch[1] || "").trim() : "";
  const plain = stripDiscordDecorations(outcomeText, { keepNewlines: false }).toLowerCase();
  if (/pex applicato/.test(plain)) return { rejected: false, actionKey: "px", label: "Pex" };
  if (/depex pm applicato|depex applicato/.test(plain)) {
    return { rejected: false, actionKey: "dp", label: "Depex" };
  }
  if (/valutazione positiva/.test(plain)) return { rejected: false, actionKey: "vp", label: "Valutazione positiva" };
  if (/valutazione negativa/.test(plain)) return { rejected: false, actionKey: "vn", label: "Valutazione negativa" };
  if (/richiamo/.test(plain)) return { rejected: false, actionKey: "rc", label: "Richiamo" };
  if (/nessuna azione/.test(plain)) return { rejected: false, actionKey: "nl", label: "Nulla" };
  if (/valutazioni gi[aà] registrate|azioni multiple/.test(plain)) {
    return { rejected: false, actionKey: "batch", label: "Azioni multiple" };
  }
  return { rejected: false, actionKey: "", label: "" };
}

function deriveResocontoStatusLabel(doc?) {
  const status = resolveResocontoDocStatus(doc);
  if (status === "pending") return statusLabelFor("pending");
  if (status === "cancelled") {
    return String(doc?.workflowFields?.statusLabel || doc?.staffReason || "Annullato (depex)").trim();
  }

  const stored = String(doc?.workflowFields?.statusLabel || doc?.staffReason || "").trim();
  if (stored && !GENERIC_RESOCONTO_STATUS_LABELS.has(stored.toLowerCase())) return stored;

  const fromKey = resocontoActionLabelForKey(doc?.workflowActionKey);
  if (fromKey) return fromKey;

  const outcome = parseResocontoOutcomeFromContent(doc?.content || doc?.body || "");
  if (outcome.label) return outcome.label;

  if (status === "rejected" || outcome.rejected) return "Azione negata";
  if (status === "accepted") return "Accettata";
  return statusLabelFor(status);
}

function resolveResocontoDocStatus(doc?) {
  let status = normalizeStatus(doc?.status, "pending");
  if (status !== "pending") return status;
  const raw = String(doc?.content || doc?.body || "");
  if (/azione negata da/i.test(raw)) return "rejected";
  if (/azione confermata da/i.test(raw)) return "accepted";
  return status;
}

function isSnowflakeLikeLabel(value?, userId?) {
  const v = String(value || "").trim();
  if (!v) return true;
  const uid = String(userId || "").trim();
  if (uid && v === uid) return true;
  return /^\d{16,22}$/.test(v);
}

function normalizeResocontoActionKey(raw?) {
  const k = String(raw || "").trim().toLowerCase();
  const codes = new Set(["vp", "vn", "nl", "px", "dp", "rc", "batch"]);
  if (codes.has(k)) return k;
  for (const [code, label] of Object.entries(RESOCONTO_ACTION_LABELS)) {
    if (k === String(label || "").trim().toLowerCase()) return code;
  }
  if (/^nulla\b|nessuna azione/.test(k)) return "nl";
  if (/depex/.test(k)) return "dp";
  if (/richiamo/.test(k)) return "rc";
  if (/^pex\b/.test(k)) return "px";
  if (/positiv/.test(k)) return "vp";
  if (/negativ/.test(k)) return "vn";
  if (/multiple|registrate/.test(k)) return "batch";
  return "";
}

function parseResocontoBodyFields(text?) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return [];
  if (!/(Staffer|Partner Manager|Ruolo|Messaggi in una settimana|Azione:)/i.test(raw)) return [];

  const lines = raw.split("\n");
  const blocks = [];
  let current = null;
  let inCode = false;
  let codeLines = [];

  const flush = () => {
    if (!current) return;
    if (codeLines.length) {
      current.value = `${current.value ? `${current.value}\n` : ""}${codeLines.join("\n")}`;
      codeLines = [];
    }
    const val = String(current.value || "").trim();
    if (current.name || val) blocks.push({ name: current.name || "Dettaglio", value: val || "—" });
    current = null;
  };

  const parseLabelLine = (line?) => {
    const emojiTokens = [];
    const protectedLine = String(line || "").replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = emojiTokens.length;
      emojiTokens.push(m);
      return `{{VCEMOJI${i}}}`;
    });
    let cleaned = stripDiscordDecorations(protectedLine, { keepNewlines: false, keepCustomEmoji: true });
    if (emojiTokens.length) {
      for (let i = 0; i < emojiTokens.length; i += 1) {
        cleaned = cleaned.split(`{{VCEMOJI${i}}}`).join(emojiTokens[i]);
      }
    }
    if (!cleaned) return null;
    if (/azione confermata da/i.test(cleaned)) {
      return {
        name: "Esito revisione",
        value: cleaned.replace(/^[\s\S]*?azione confermata da\s*/i, "Confermata da ").trim(),
      };
    }
    if (/azione negata da/i.test(cleaned)) {
      return {
        name: "Esito revisione",
        value: cleaned.replace(/^[\s\S]*?azione negata da\s*/i, "Negata da ").trim(),
      };
    }
        const tokens2 = [];
    const masked = cleaned.replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = tokens2.length;
      tokens2.push(m);
      return `{{VCEMOJI${i}}}`;
    });
    const colon = masked.match(/^(.*):\s*(.*)$/);
    if (!colon) return null;
    let label = String(colon[1] || "").trim();
    let value = String(colon[2] || "").trim();
    if (!label || label.length > 120) return null;
    if (/^\{\{VCEMOJI\d+\}\}$/.test(label)) return null;
    for (let i = 0; i < tokens2.length; i += 1) {
      label = label.split(`{{VCEMOJI${i}}}`).join(tokens2[i]);
      value = value.split(`{{VCEMOJI${i}}}`).join(tokens2[i]);
    }
    return { name: label, value };
  };

  lines.forEach((line?) => {
    const trimmed = line.trim();
    if (trimmed === "```") {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (!trimmed) return;
    if (/^messaggi per giorno$/i.test(stripDiscordDecorations(trimmed))) {
      if (current) current.value = `${current.value ? `${current.value}\n` : ""}messaggi per giorno`;
      return;
    }
    const hit = parseLabelLine(line);
    if (hit) {
      flush();
      current = { name: hit.name, value: hit.value };
      return;
    }
    if (/\u2192/.test(trimmed) && /messaggi|ore/i.test(trimmed)) {
      flush();
      current = { name: "Scambio limiti", value: stripDiscordDecorations(trimmed, { keepCustomEmoji: true }) };
      flush();
      return;
    }
    if (current) current.value = `${current.value ? `${current.value}\n` : ""}${trimmed}`;
  });
  flush();
  return blocks.filter((b?) => stripDiscordDecorations(b.name || "") || stripDiscordDecorations(b.value || "", { keepCustomEmoji: true }));
}

export = { RESOCONTO_LIST_ROLE_RANK, RESOCONTO_LIST_RANK_FALLBACK, stripDiscordDecorations, weekKeyFromDate, formatWeekLabel, buildWorkflowDedupeKey, normalizeStatus, statusLabelFor, pauseTrackRoleKey, cleanPauseSubjectDisplayName, pauseRoleDisplayLabel, resocontoActionLabelForKey, extractResocontoAzioneText, formatResocontoProposedLabel, buildResocontoInboxPreview, deriveResocontoStaffFlags, parseResocontoOutcomeFromContent, deriveResocontoStatusLabel, resolveResocontoDocStatus, isSnowflakeLikeLabel, normalizeResocontoActionKey, parseResocontoBodyFields };
