/** Minigiochi: invio dei messaggi e reazioni di risposta giusta/sbagliata. */
const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { isComponentsV2Message } = require("../../../shared/embeds/vcPageEmbedV2") as typeof import("../../../shared/embeds/vcPageEmbedV2");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MINIGAME_WIN_EMOJI = E.VC_Events;
const MINIGAME_CORRECT_FALLBACK_EMOJI = "\u2714";
const MINIGAME_WRONG_EMOJI = E.VC_Cross;
const V2_FLAG = Number(MessageFlags?.IsComponentsV2 || 1 << 15);

/**
 * @param opts.type tipo minigioco — se presente, prova start/win draft dalla dashboard
 * @param opts.kind 'start' | 'win' (default start)
 * @param opts.vars placeholder del draft
 */
async function sendMinigameMessage(channel?, payload?, opts: { type?: string; kind?: "start" | "win"; vars?: Record<string, string>; mentionUserId?: string | null } = {}) {
  if (!channel?.send) return null;
  try {
    let body = payload;
    if (opts?.type) {
      try {
        const { applyMinigameDraftToPayload } = require("./minigameDraftSend") as typeof import("./minigameDraftSend");
        body = applyMinigameDraftToPayload(payload, {
          type: opts.type,
          kind: opts.kind || "start",
          vars: opts.vars || {},
          mentionUserId: opts.mentionUserId || null,
          guild: channel.guild || null,
        });
      } catch (_) {}
    }
    const outgoing =
      body && typeof body === "object" && !Array.isArray(body)
        ? applyDefaultFooterToEmbeds(body, channel.guild)
        : body;
    return await channel.send(outgoing);
  } catch (err) {
    warnMinigame(err);
    return null;
  }
}

/** Sostituisce le media attachment:// (canvas del round) nei components V2. */
function replaceV2AttachmentMedia(components?, nextUrl?) {
  const url = String(nextUrl || "").trim();
  if (!url) return components;
  const swap = (list?) =>
    (Array.isArray(list) ? list : []).map((c?) => {
      if (!c || typeof c !== "object") return c;
      const out: any = { ...c };
      if (out.type === 12 && Array.isArray(out.items)) {
        out.items = out.items.map((i?) => {
          const u = String(i?.media?.url || "");
          if (!u || u.startsWith("attachment://")) return { ...i, media: { ...(i?.media || {}), url } };
          return i;
        });
      }
      if (out.type === 11) {
        const u = String(out.media?.url || "");
        if (!u || u.startsWith("attachment://")) out.media = { ...(out.media || {}), url };
      }
      if (out.accessory?.type === 11) {
        const u = String(out.accessory?.media?.url || "");
        if (!u || u.startsWith("attachment://")) {
          out.accessory = { ...out.accessory, media: { ...(out.accessory.media || {}), url } };
        }
      }
      if (Array.isArray(out.components)) out.components = swap(out.components);
      return out;
    });
  return swap(components);
}

/**
 * Aggiorna l'immagine del round (hangman / canvas).
 * Con Components V2 non si possono editare gli embeds: si aggiorna la gallery + files.
 */
async function editMinigameRoundImage(gameMsg?, opts: { attachment?: any; embed?: any; files?: any[] } = {}) {
  if (!gameMsg?.edit) return false;
  const attachment = opts.attachment || null;
  const files = Array.isArray(opts.files) ? opts.files : attachment ? [attachment] : [];
  const name = String(attachment?.name || files[0]?.name || "").trim();
  const nextUrl = name ? `attachment://${name}` : "";

  if (isComponentsV2Message(gameMsg)) {
    if (!nextUrl || !files.length) return false;
    const raw = (gameMsg.components || []).map((c?) => (typeof c?.toJSON === "function" ? c.toJSON() : c));
    const components = replaceV2AttachmentMedia(raw, nextUrl);
    const ok = await gameMsg
      .edit({
        components,
        files,
        attachments: [],
        flags: V2_FLAG,
      })
      .then(() => true)
      .catch((err?) => {
        warnMinigame(err);
        return false;
      });
    return ok;
  }

  const payload: Record<string, any> = {};
  if (opts.embed) payload.embeds = [opts.embed];
  if (files.length) {
    payload.files = files;
    payload.attachments = [];
  }
  return gameMsg
    .edit(payload)
    .then(() => true)
    .catch((err?) => {
      warnMinigame(err);
      return false;
    });
}

async function reactMinigameWin(message?) {
  let reacted = false;
  try {
    await message.react(MINIGAME_WIN_EMOJI);
    reacted = true;
  } catch (err) {
    warnMinigame(err);
  }
  if (!reacted) {
    await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => {});
  }
}

async function reactMinigameWrongEmoji(message?, _game = null) {
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
}

export = {
  MINIGAME_CORRECT_FALLBACK_EMOJI,
  MINIGAME_WRONG_EMOJI,
  sendMinigameMessage,
  editMinigameRoundImage,
  reactMinigameWin,
  reactMinigameWrongEmoji,
};
