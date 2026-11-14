/**
 * Testi embed/pulsanti e ruoli delete per quote/repost/clip/skull (dashboard Bacheca).
 * Autore del contenuto può sempre rimuovere.
 */
const SNOWFLAKE = /^\d{16,22}$/;
const KINDS = Object.freeze(["quote", "repost", "clip", "skull"] as const);

type BoardKind = (typeof KINDS)[number];

type BoardKindPresentation = {
  embedTitle: string;
  embedDescription: string;
  embedFooter: string;
  fieldAuthor: string;
  fieldCreator: string;
  fieldChannel: string;
  fieldMessage: string;
  buttonRepost: string;
  buttonRemove: string;
  deleteRoleIds: string[];
  /** Embed di risposta al comando (+quote / +repost / +clip) o conferma 💀 */
  ackDescription: string;
  ackDescriptionSite: string;
  ackDescriptionChannel: string;
  ackFieldName: string;
  ackFooter: string;
  /** Solo repost: embed roulette */
  rouletteTitle: string;
  rouletteDescription: string;
  rouletteFooter: string;
  /** messaggi personalizzati come nelle altre schede (testo + embed o Components V2); null = quello predefinito */
  drafts: { post: any | null; reply: any | null; roulette: any | null };
  /** frasi casuali per {phrase} (repost e clip); vuoto = predefinite */
  phrases: string[];
  /** Quote: la risposta al comando senza l'immagine della quote */
  hideReplyImage: boolean;
  /** emoji e colore dei pulsanti del bot (1 blu, 2 grigio, 3 verde, 4 rosso) */
  buttonRepostEmoji: string;
  buttonRemoveEmoji: string;
  buttonRepostStyle: number;
  buttonRemoveStyle: number;
  /** Skullboard: pulsante link "Vai al Post" sotto la conferma (i link non cambiano colore) */
  buttonLink: string;
  buttonLinkEmoji: string;
};

const BTN_DEFAULTS = {
  buttonRepostEmoji: "<a:reddiamond:1443652837346377841>",
  buttonRemoveEmoji: "🗑️",
  buttonRepostStyle: 2,
  buttonRemoveStyle: 4,
  buttonLink: "Vai al Post",
  buttonLinkEmoji: "💀",
};
const btnStyle = (v?, fb = 2) => {
  const n = Math.floor(Number(v));
  return n >= 1 && n <= 4 ? n : fb;
};

const PHRASES_MAX = 300;
const PHRASE_LEN = 200;
function defaultPhrases(kind: BoardKind): string[] {
  try {
    const P = require("./repostAckPhrases") as typeof import("./repostAckPhrases");
    if (kind === "repost") return P.REPOST_ACK_PHRASES;
    if (kind === "clip") return P.CLIP_ACK_PHRASES;
  } catch {
    /* nessuna */
  }
  return [];
}
function normalizePhrases(kind: BoardKind, raw?): string[] {
  if (!Array.isArray(raw)) return defaultPhrases(kind);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const v = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, PHRASE_LEN);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= PHRASES_MAX) break;
  }
  return out.length ? out : defaultPhrases(kind);
}
const samePhrases = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const DRAFT_SLOTS = ["post", "reply", "roulette"] as const;
function normalizeDrafts(raw?): BoardKindPresentation["drafts"] {
  const out: BoardKindPresentation["drafts"] = { post: null, reply: null, roulette: null };
  if (!raw || typeof raw !== "object") return out;
  let T: any = null;
  try {
    T = require("../../../MultiGuild/core/tenantCommunityTools");
  } catch {
    return out;
  }
  for (const slot of DRAFT_SLOTS) {
    const d = (raw as any)[slot];
    if (!d || typeof d !== "object") continue;
    const n = T.normalizeDraft(d);
    out[slot] = T.draftIsEmpty(n) ? null : n;
  }
  return out;
}

function liveEmoji(key: string, fallback = "") {
  try {
    const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
    return String((E as any)[key] || fallback);
  } catch {
    return fallback;
  }
}

/** Testi live del bot (emoji custom + copy attuale). */
function liveDefaults(): Record<BoardKind, BoardKindPresentation> {
  const sparkles = liveEmoji("VC_Sparkles", "✨");
  const reply = liveEmoji("VC_Reply", "");
  const skully = liveEmoji("VC_Skully", "💀");
  const userE = liveEmoji("VC_User", "👤");
  const channelE = liveEmoji("VC_Channel", "📺");
  const chatE = liveEmoji("VC_Chat", "💬");
  const red = liveEmoji("reddiamond", "♦️");
  const replyPrefix = reply ? `${reply} ` : "";

  const emptyExtra = {
    fieldChannel: "",
    fieldMessage: "",
    ackDescription: "",
    ackDescriptionSite: "",
    ackDescriptionChannel: "",
    ackFieldName: "",
    ackFooter: "",
    rouletteTitle: "",
    rouletteDescription: "",
    rouletteFooter: "",
    drafts: { post: null, reply: null, roulette: null },
    phrases: [] as string[],
    hideReplyImage: false,
    ...BTN_DEFAULTS,
  };

  return {
    quote: {
      ...emptyExtra,
      embedTitle: `${sparkles} Nuova quotazione ✨`,
      embedDescription: `${replyPrefix}Crea un post usando il comando **{prefix}quote** rispondendo al messaggio di un utente.`,
      embedFooter: "Post totali: {count}",
      fieldAuthor: "Messaggio di:",
      fieldCreator: "Creato da:",
      buttonRepost: "Reposta",
      buttonRemove: "Rimuovi questa quote",
      deleteRoleIds: [],
      ackDescription: `${sparkles} Quote pubblicata in questo canale.`,
      ackDescriptionSite: `${sparkles} La quote è appesa in **Bacheca** sul sito!`,
      ackDescriptionChannel: `${sparkles} Puoi trovare il post creato nel canale: {channel}!`,
      ackFieldName: "📸 Totale immagini generate:",
    },
    repost: {
      ...emptyExtra,
      embedTitle: "🆕 * . ˊ Nuovo repost!",
      embedDescription:
        "di {reposter} 🎀\n\n{body}\n\n• [Clicca qui per andare al messaggio]({source})\n\nɤ⌒➴ Autore del messaggio: {author}",
      embedFooter: "† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando {prefix}repost · Post #{count}",
      fieldAuthor: "",
      fieldCreator: "",
      buttonRepost: "Reposta",
      buttonRemove: "Rimuovi repost",
      deleteRoleIds: [],
      ackDescription: `${red} * . ˊ {reposter} {phrase}\n\n{link}`,
      ackFooter: `✧ * . ˊ {prefix}repost`,
      rouletteTitle: `${red} * . ˊ Roulette dei Repost Passati`,
      rouletteDescription: "{body}\n\n• [Messaggio Originale]({source})",
      rouletteFooter: "† · ৎ Revival casuale dal database 🎲",
    },
    clip: {
      ...emptyExtra,
      embedTitle: "🎙️ Clip vocale",
      embedDescription: "Ultimi **{duration}s** da **{channel}**\n\n**Trascrizione**\n{body}",
      embedFooter: "† · ৎ {prefix}clip · Post #{count}",
      fieldAuthor: "Clip di",
      fieldCreator: "",
      buttonRepost: "Reposta",
      buttonRemove: "Rimuovi clip",
      deleteRoleIds: [],
      ackDescription: "🎙️ {reposter} {phrase}\n{link}",
      ackFooter: `✧ * . ˊ {prefix}clip`,
    },
    skull: {
      ...emptyExtra,
      embedTitle: "",
      embedDescription: `${skully} **Aggiungi la reazione 💀 a un messaggio per pubblicarlo nella SkullBoard**`,
      embedFooter: "{date}",
      fieldAuthor: `${userE} Autore`,
      fieldCreator: "",
      fieldChannel: `${channelE} Canale`,
      fieldMessage: `${chatE} Messaggio`,
      buttonRepost: "",
      buttonRemove: "Rimuovi",
      deleteRoleIds: [],
      ackDescription: `${skully} Il messaggio è stato pubblicato nel canale {channel}.`,
      ackDescriptionSite: `${skully} Il messaggio è stato appeso in **Bacheca** sul sito.`,
      ackDescriptionChannel: `${skully} Il messaggio è stato pubblicato nel canale {channel}.`,
    },
  };
}

const DEFAULTS: Record<BoardKind, BoardKindPresentation> = liveDefaults();

function clampStr(value?, max = 256) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeRoleIds(raw?) {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!SNOWFLAKE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 25) break;
  }
  return out;
}

function defaultKindPresentation(kind: BoardKind): BoardKindPresentation {
  return { ...DEFAULTS[kind], deleteRoleIds: [], drafts: { post: null, reply: null, roulette: null }, phrases: defaultPhrases(kind), hideReplyImage: false, ...BTN_DEFAULTS };
}

function normalizeKindPresentation(kind: BoardKind, raw?): BoardKindPresentation {
  const base = defaultKindPresentation(kind);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, any>;
  /* testo vuoto = testo predefinito (un embed o un pulsante vuoto Discord lo rifiuta) */
  const pick = (key: Exclude<keyof BoardKindPresentation, "deleteRoleIds" | "drafts" | "phrases" | "hideReplyImage" | "buttonRepostStyle" | "buttonRemoveStyle">, max: number) =>
    clampStr(r[key], max) || base[key];
  return {
    embedTitle: pick("embedTitle", 256),
    embedDescription: pick("embedDescription", 4000),
    embedFooter: pick("embedFooter", 2048),
    fieldAuthor: pick("fieldAuthor", 256),
    fieldCreator: pick("fieldCreator", 256),
    fieldChannel: pick("fieldChannel", 256),
    fieldMessage: pick("fieldMessage", 256),
    buttonRepost: pick("buttonRepost", 80),
    buttonRemove: pick("buttonRemove", 80),
    deleteRoleIds: normalizeRoleIds(r.deleteRoleIds),
    ackDescription: pick("ackDescription", 4000),
    ackDescriptionSite: pick("ackDescriptionSite", 4000),
    ackDescriptionChannel: pick("ackDescriptionChannel", 4000),
    ackFieldName: pick("ackFieldName", 256),
    ackFooter: pick("ackFooter", 2048),
    rouletteTitle: pick("rouletteTitle", 256),
    rouletteDescription: pick("rouletteDescription", 4000),
    rouletteFooter: pick("rouletteFooter", 2048),
    drafts: normalizeDrafts(r.drafts),
    phrases: normalizePhrases(kind, r.phrases),
    hideReplyImage: r.hideReplyImage === true,
    /* emoji: vuota = nessuna emoji sul pulsante */
    buttonRepostEmoji: r.buttonRepostEmoji === "" ? "" : pick("buttonRepostEmoji", 80),
    buttonRemoveEmoji: r.buttonRemoveEmoji === "" ? "" : pick("buttonRemoveEmoji", 80),
    buttonRepostStyle: btnStyle(r.buttonRepostStyle, base.buttonRepostStyle),
    buttonRemoveStyle: btnStyle(r.buttonRemoveStyle, base.buttonRemoveStyle),
    buttonLink: pick("buttonLink", 80),
    buttonLinkEmoji: r.buttonLinkEmoji === "" ? "" : pick("buttonLinkEmoji", 80),
  };
}

function defaultBoardsPresentation() {
  return {
    quote: defaultKindPresentation("quote"),
    repost: defaultKindPresentation("repost"),
    clip: defaultKindPresentation("clip"),
    skull: defaultKindPresentation("skull"),
  };
}

function normalizeBoardsPresentation(raw?) {
  const base = defaultBoardsPresentation();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const src = raw as Record<string, any>;
  return {
    quote: normalizeKindPresentation("quote", src.quote),
    repost: normalizeKindPresentation("repost", src.repost),
    clip: normalizeKindPresentation("clip", src.clip),
    skull: normalizeKindPresentation("skull", src.skull),
  };
}

const KIND_COMPACT: Record<BoardKind, string> = { quote: "q", repost: "r", clip: "c", skull: "k" };

function encodeBoardsPresentationCompact(presentation?) {
  const full = normalizeBoardsPresentation(presentation);
  const out: Record<string, any> = {};
  for (const kind of KINDS) {
    const cur = full[kind];
    const def = DEFAULTS[kind];
    const row: Record<string, any> = {};
    if (cur.embedTitle !== def.embedTitle) row.t = cur.embedTitle;
    if (cur.embedDescription !== def.embedDescription) row.d = cur.embedDescription;
    if (cur.embedFooter !== def.embedFooter) row.f = cur.embedFooter;
    if (cur.fieldAuthor && cur.fieldAuthor !== def.fieldAuthor) row.fa = cur.fieldAuthor;
    if (cur.fieldCreator && cur.fieldCreator !== def.fieldCreator) row.fc = cur.fieldCreator;
    if (cur.fieldChannel && cur.fieldChannel !== def.fieldChannel) row.fch = cur.fieldChannel;
    if (cur.fieldMessage && cur.fieldMessage !== def.fieldMessage) row.fm = cur.fieldMessage;
    if (cur.buttonRepost !== def.buttonRepost) row.br = cur.buttonRepost;
    if (cur.buttonRemove !== def.buttonRemove) row.bx = cur.buttonRemove;
    if (cur.deleteRoleIds.length) row.dr = cur.deleteRoleIds;
    if (cur.ackDescription !== def.ackDescription) row.ad = cur.ackDescription;
    if (cur.ackDescriptionSite !== def.ackDescriptionSite) row.ads = cur.ackDescriptionSite;
    if (cur.ackDescriptionChannel !== def.ackDescriptionChannel) row.adc = cur.ackDescriptionChannel;
    if (cur.ackFieldName !== def.ackFieldName) row.afn = cur.ackFieldName;
    if (cur.ackFooter !== def.ackFooter) row.af = cur.ackFooter;
    if (cur.rouletteTitle !== def.rouletteTitle) row.rt = cur.rouletteTitle;
    if (cur.rouletteDescription !== def.rouletteDescription) row.rd = cur.rouletteDescription;
    if (cur.rouletteFooter !== def.rouletteFooter) row.rf = cur.rouletteFooter;
    const ms: Record<string, any> = {};
    for (const slot of DRAFT_SLOTS) if (cur.drafts?.[slot]) ms[slot] = cur.drafts[slot];
    if (Object.keys(ms).length) row.ms = ms;
    if (!samePhrases(cur.phrases, defaultPhrases(kind))) row.ph = cur.phrases;
    if (cur.hideReplyImage) row.hri = 1;
    if (cur.buttonRepostEmoji !== BTN_DEFAULTS.buttonRepostEmoji) row.bre = cur.buttonRepostEmoji;
    if (cur.buttonRemoveEmoji !== BTN_DEFAULTS.buttonRemoveEmoji) row.bxe = cur.buttonRemoveEmoji;
    if (cur.buttonRepostStyle !== BTN_DEFAULTS.buttonRepostStyle) row.brs = cur.buttonRepostStyle;
    if (cur.buttonRemoveStyle !== BTN_DEFAULTS.buttonRemoveStyle) row.bxs = cur.buttonRemoveStyle;
    if (cur.buttonLink !== BTN_DEFAULTS.buttonLink) row.bl = cur.buttonLink;
    if (cur.buttonLinkEmoji !== BTN_DEFAULTS.buttonLinkEmoji) row.ble = cur.buttonLinkEmoji;
    if (Object.keys(row).length) out[KIND_COMPACT[kind]] = row;
  }
  return Object.keys(out).length ? out : null;
}

function decodeBoardsPresentationCompact(raw?) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultBoardsPresentation();
  const r = raw as Record<string, any>;
  const unpack = (kind: BoardKind, blob?) => {
    if (!blob || typeof blob !== "object") return defaultKindPresentation(kind);
    return normalizeKindPresentation(kind, {
      embedTitle: blob.t ?? blob.embedTitle,
      embedDescription: blob.d ?? blob.embedDescription,
      embedFooter: blob.f ?? blob.embedFooter,
      fieldAuthor: blob.fa ?? blob.fieldAuthor,
      fieldCreator: blob.fc ?? blob.fieldCreator,
      fieldChannel: blob.fch ?? blob.fieldChannel,
      fieldMessage: blob.fm ?? blob.fieldMessage,
      buttonRepost: blob.br ?? blob.buttonRepost,
      buttonRemove: blob.bx ?? blob.buttonRemove,
      deleteRoleIds: blob.dr ?? blob.deleteRoleIds,
      ackDescription: blob.ad ?? blob.ackDescription,
      ackDescriptionSite: blob.ads ?? blob.ackDescriptionSite,
      ackDescriptionChannel: blob.adc ?? blob.ackDescriptionChannel,
      ackFieldName: blob.afn ?? blob.ackFieldName,
      ackFooter: blob.af ?? blob.ackFooter,
      rouletteTitle: blob.rt ?? blob.rouletteTitle,
      rouletteDescription: blob.rd ?? blob.rouletteDescription,
      rouletteFooter: blob.rf ?? blob.rouletteFooter,
      drafts: blob.ms ?? blob.drafts,
      phrases: blob.ph ?? blob.phrases,
      hideReplyImage: blob.hri === 1 || blob.hideReplyImage === true,
      buttonRepostEmoji: blob.bre ?? blob.buttonRepostEmoji,
      buttonRemoveEmoji: blob.bxe ?? blob.buttonRemoveEmoji,
      buttonRepostStyle: blob.brs ?? blob.buttonRepostStyle,
      buttonRemoveStyle: blob.bxs ?? blob.buttonRemoveStyle,
      buttonLink: blob.bl ?? blob.buttonLink,
      buttonLinkEmoji: blob.ble ?? blob.buttonLinkEmoji,
    });
  };
  if (r.quote || r.repost || r.clip || r.skull) return normalizeBoardsPresentation(r);
  return {
    quote: unpack("quote", r.q),
    repost: unpack("repost", r.r),
    clip: unpack("clip", r.c),
    skull: unpack("skull", r.k),
  };
}

function fillBoardTemplate(template?, vars: Record<string, string> = {}) {
  let out = String(template || "");
  /* body/text/phrase vuoti: togli la riga (anche con » davanti), come nei draft dashboard */
  for (const key of ["body", "text", "phrase", "bonus", "image"]) {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) continue;
    if (String(vars[key] ?? "").trim()) continue;
    const token = `\\{${key}\\}`;
    out = out
      .replace(new RegExp(`\\n[ \\t]*»?[ \\t]*${token}[ \\t]*(?=\\n|$)`, "g"), "")
      .replace(new RegExp(`^[ \\t]*»?[ \\t]*${token}[ \\t]*\\n?`, "g"), "")
      .replace(new RegExp(`${token}[ \\t]*\\n`, "g"), "")
      .replace(new RegExp(token, "g"), "");
  }
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(value ?? ""));
  }
  return out
    .replace(/^[ \t]*»[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function readBoardsPresentationFromBlob(b?) {
  if (!b || typeof b !== "object") return defaultBoardsPresentation();
  const raw = b.pr ?? b.presentation;
  return decodeBoardsPresentationCompact(raw);
}

function getBoardKindPresentationSync(guildId?, kind?) {
  const k = String(kind || "").trim().toLowerCase() as BoardKind;
  if (!KINDS.includes(k)) return defaultKindPresentation("repost");
  try {
    const { getTenantBoardsSync } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
    const boards = getTenantBoardsSync(guildId);
    const pr = boards?.presentation && typeof boards.presentation === "object" ? boards.presentation : null;
    return normalizeKindPresentation(k, pr?.[k]);
  } catch {
    return defaultKindPresentation(k);
  }
}

/** Emoji e colore scelti in dashboard su un pulsante del bot (Reposta o Rimuovi). */
function styleBoardButton<T extends { setEmoji: (e: any) => T; setStyle: (s: any) => T; data?: any }>(button: T, guildId?, kind?, which: "repost" | "remove" = "repost"): T {
  try {
    const pr: any = getBoardKindPresentationSync(guildId, kind);
    const emoji = String(which === "repost" ? pr.buttonRepostEmoji : pr.buttonRemoveEmoji);
    const style = btnStyle(which === "repost" ? pr.buttonRepostStyle : pr.buttonRemoveStyle, which === "repost" ? 2 : 4);
    button.setStyle(style);
    if (emoji) {
      const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
      const parsed = T.parseEmoji(emoji);
      if (parsed) button.setEmoji(parsed);
    } else if (button.data) {
      delete button.data.emoji;
    }
  } catch {
    /* come prima */
  }
  return button;
}

function memberHasBoardDeleteRole(member?, roleIds: string[] = []) {
  if (!member?.roles?.cache || !roleIds.length) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function memberCanForceDeleteBoardItem(member?, guildId?, kind?) {
  if (!member) return false;
  /* in ogni server: chi amministra o gestisce i messaggi può sempre togliere i post */
  try {
    const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
    const perms = member.permissions;
    if (perms?.has?.(PermissionFlagsBits.Administrator) || perms?.has?.(PermissionFlagsBits.ManageMessages)) return true;
  } catch {
    /* ignore */
  }
  try {
    const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
    const highStaffId = String(IDs.roles?.HighStaff || "").trim();
    const directorId = String(IDs.roles?.Director || "").trim();
    if (highStaffId && member.roles?.cache?.has(highStaffId)) return true;
    if (directorId && member.roles?.cache?.has(directorId)) return true;
  } catch {
    /* ignore */
  }
  const pr = getBoardKindPresentationSync(guildId, kind);
  return memberHasBoardDeleteRole(member, pr.deleteRoleIds);
}

export = {
  KINDS,
  DEFAULTS,
  defaultBoardsPresentation,
  defaultKindPresentation,
  normalizeBoardsPresentation,
  normalizeKindPresentation,
  encodeBoardsPresentationCompact,
  decodeBoardsPresentationCompact,
  fillBoardTemplate,
  readBoardsPresentationFromBlob,
  getBoardKindPresentationSync,
  memberCanForceDeleteBoardItem,
  styleBoardButton,
};
