const crypto = require("node:crypto") as typeof import("node:crypto");
const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { saveTranscriptHtml } = require("./transcriptUtils") as typeof import("./transcriptUtils");

const TRANSCRIPT_VIEW_TOKEN_BYTES = 32;
const TRANSCRIPT_INLINE_MAX_CHARS = 48_000;
const TRANSCRIPT_VIEW_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function generateTranscriptViewToken() {
  return crypto.randomBytes(TRANSCRIPT_VIEW_TOKEN_BYTES).toString("hex");
}

function normalizeTranscriptViewTokenParam(raw?) {
  const s = decodeURIComponent(String(raw || "").trim());
  if (!/^[a-f0-9]{64}$/i.test(s)) return "";
  return s.toLowerCase();
}

function resolveTranscriptPublicBaseUrl() {
  return String(process.env.TICKET_TRANSCRIPT_PUBLIC_BASE_URL || process.env.WEBSITE_PUBLIC_ORIGIN || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
}

function buildTicketTranscriptViewUrl(viewToken?) {
  const base = resolveTranscriptPublicBaseUrl();
  const tok = String(viewToken || "").trim().toLowerCase();
  if (!base || !/^[a-f0-9]{64}$/.test(tok)) return "";
    return `${base}/dashboard/transcript/?t=${encodeURIComponent(tok)}`;
}

function buildTicketTranscriptApiUrl(viewToken?) {
  const base = resolveTranscriptPublicBaseUrl();
  const tok = String(viewToken || "").trim().toLowerCase();
  if (!base || !/^[a-f0-9]{64}$/.test(tok)) return "";
  return `${base}/ticket-transcript/${encodeURIComponent(tok)}`;
}

function transcriptViewExpired(ticketDoc?) {
  const raw = ticketDoc?.transcriptViewExpiresAt;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return !Number.isFinite(t) || t < Date.now();
}

async function prepareTicketTranscriptSecureFields(channel?, html?) {
  const trimmed = typeof html === "string" ? html : "";
  if (!trimmed) {
    return {
      transcriptHtmlPath: null,
      transcriptViewToken: null,
      transcriptHtmlInline: null,
      transcriptViewExpiresAt: null,
    };
  }
  const transcriptHtmlPath = await saveTranscriptHtml(channel, trimmed).catch(() => null);
    const transcriptHtmlInline = null;
  if (!transcriptHtmlPath) {
    return {
      transcriptHtmlPath: null,
      transcriptViewToken: null,
      transcriptHtmlInline: null,
      transcriptViewExpiresAt: null,
    };
  }
  const transcriptViewToken = generateTranscriptViewToken();
  const transcriptViewExpiresAt = new Date(Date.now() + TRANSCRIPT_VIEW_TTL_MS);
  return {
    transcriptHtmlPath,
    transcriptViewToken,
    transcriptHtmlInline,
    transcriptViewExpiresAt,
  };
}

function buildTicketTranscriptActionRow(ticketId?, viewUrl?) {
  const emoji = "<:VC_file:1478515880722698300>";
  const id = String(ticketId || "").trim();
  if (viewUrl) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(viewUrl).setLabel("Visualizza Trascrizione").setEmoji(emoji),
    );
  }
  if (!id) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_transcript:${id}`)
      .setLabel("Visualizza Trascrizione")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(emoji),
  );
}

function timingSafeHexEq(a?, b?) {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(x) || x.length !== y.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"));
  } catch {
    return false;
  }
}

export = {
  TRANSCRIPT_INLINE_MAX_CHARS,
  TRANSCRIPT_VIEW_TTL_MS,
  normalizeTranscriptViewTokenParam,
  resolveTranscriptPublicBaseUrl,
  buildTicketTranscriptViewUrl,
  buildTicketTranscriptApiUrl,
  transcriptViewExpired,
  prepareTicketTranscriptSecureFields,
  buildTicketTranscriptActionRow,
  timingSafeHexEq,
};