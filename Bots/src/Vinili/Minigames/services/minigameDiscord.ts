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

function mergeRoleAllowedMentions(body?, ping?) {
  const text = String(ping || "");
  const roleIds = [...text.matchAll(/<@&(\d{16,22})>/g)].map((m) => m[1]);
  if (!roleIds.length || !body || typeof body !== "object") return body;
  const prev = body.allowedMentions || body.allowed_mentions || {};
  const roles = [...new Set([...(Array.isArray(prev.roles) ? prev.roles.map(String) : []), ...roleIds])].slice(0, 20);
  const next = {
    parse: Array.isArray(prev.parse) ? prev.parse : [],
    ...(Array.isArray(prev.users) && prev.users.length ? { users: prev.users } : {}),
    roles,
  };
  const out = { ...body, allowedMentions: next };
  if (out.allowed_mentions) delete out.allowed_mentions;
  return out;
}

/** Infila il ping nel content (embed classici) o come Text Display in cima (V2). */
function injectMinigameRolePingIntoBody(body?, ping?) {
  const mention = String(ping || "").trim();
  if (!mention || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const blob = `${String(body.content || "")}\n${JSON.stringify(body.components || [])}`;
  if (blob.includes(mention) || /<@&\d{16,22}>/.test(blob)) {
    return mergeRoleAllowedMentions(body, mention);
  }
  const isV2 = (Number(body.flags) & V2_FLAG) !== 0 || isComponentsV2Message(body);
  if (isV2) {
    const text = { type: 10, content: mention };
    const components = Array.isArray(body.components) ? [...body.components] : [];
    if (components[0]?.type === 17) {
      const inner = Array.isArray(components[0].components) ? components[0].components : [];
      components[0] = { ...components[0], components: [text, ...inner] };
    } else {
      components.unshift(text);
    }
    return mergeRoleAllowedMentions(
      { ...body, components, content: body.content == null ? "" : body.content, flags: Number(body.flags || 0) | V2_FLAG, embeds: [] },
      mention,
    );
  }
  const content = [mention, String(body.content || "").trim()].filter(Boolean).join("\n").slice(0, 2000);
  return mergeRoleAllowedMentions({ ...body, content }, mention);
}

/**
 * Durante lo Star Wars ogni minigioco in rotazione annuncia gli stessi premi evento (exp evento + crediti),
 * come il quiz: prima solo il quiz li diceva, gli altri no.
 */
function appendStarWarsStartRewardLine(body?, channel?, type?) {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");
    const base: any = getConfig(channel?.client) || {};
    const cfg = { ...base, guildId: String(channel?.guild?.id || channel?.guildId || "") };
    const hooks: any = require("../utils/starWarsMinigameHooks");
    if (!hooks.countsTowardStarWarsEventWinRewards?.(type, cfg)) return body;
    const quiz = cfg.starWarsQuiz && typeof cfg.starWarsQuiz === "object" ? cfg.starWarsQuiz : {};
    const exp = Math.max(0, Math.floor(Number(quiz.rewardExp ?? 50) || 0));
    const credits = Math.max(0, Math.floor(Number(quiz.rewardCredits ?? 5000) || 0));
    const line = `🌌 **Premi evento** · ${E.VC_EXP} **+${exp}** exp evento · ${E.VC_crediti} **+${credits.toLocaleString("it-IT")}** crediti evento`;
    const out: any = { ...body };
    if (Array.isArray(out.embeds) && out.embeds[0]) {
      const e0: any = out.embeds[0];
      const json: any = typeof e0?.toJSON === "function" ? e0.toJSON() : e0?.data || e0;
      const d = String(json?.description || "");
      if (/crediti/i.test(d)) return body;
      out.embeds = [{ ...json, description: `${d}\n${line}`.trim() }, ...out.embeds.slice(1)];
      return out;
    }
    if (Array.isArray(out.components) && out.components.length) {
      const flat = JSON.stringify(out.components.map((c: any) => (typeof c?.toJSON === "function" ? c.toJSON() : c)));
      if (/crediti/i.test(flat)) return body;
      const block = { type: 10, content: line };
      const insert = (list: any[]) => {
        let at = list.length;
        while (at > 0 && list[at - 1]?.type === 1) at -= 1;
        return [...list.slice(0, at), block, ...list.slice(at)];
      };
      const comps = out.components.map((c: any) => (typeof c?.toJSON === "function" ? c.toJSON() : c));
      const ci = comps.findIndex((c: any) => c?.type === 17);
      if (ci >= 0) comps[ci] = { ...comps[ci], components: insert(Array.isArray(comps[ci].components) ? comps[ci].components : []) };
      out.components = ci >= 0 ? comps : insert(comps);
      return out;
    }
    return body;
  } catch {
    return body;
  }
}

/**
 * @param opts.type tipo minigioco — se presente, prova start/win draft dalla dashboard
 * @param opts.kind 'start' | 'win' (default start)
 * @param opts.vars placeholder del draft
 */
async function sendMinigameMessage(channel?, payload?, opts: { type?: string; kind?: "start" | "win"; vars?: Record<string, string>; mentionUserId?: string | null } = {}) {
  if (!channel?.send) return null;
  try {
    const kind = opts?.kind || "start";
    /* Solo round di start (con type): timeout/hint non devono mangiare il ping. */
    const attachRolePing = kind === "start" && Boolean(opts?.type);
    let ping = "";
    if (attachRolePing) {
      try {
        const { takePendingMinigameRolePing, peekPendingMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
        ping = peekPendingMinigameRolePing(channel.id) || "";
        if (ping) takePendingMinigameRolePing(channel.id);
      } catch (_) {}
    }
    const vars = { ...(opts.vars || {}) };
    if (ping && vars.ping == null) vars.ping = ping;

    let body = payload;
    if (opts?.type) {
      try {
        const { applyMinigameDraftToPayload } = require("./minigameDraftSend") as typeof import("./minigameDraftSend");
        body = applyMinigameDraftToPayload(payload, {
          type: opts.type,
          kind,
          vars,
          mentionUserId: opts.mentionUserId || null,
          guild: channel.guild || null,
        });
      } catch (_) {}
    } else if (ping && body && typeof body === "object" && !Array.isArray(body)) {
      body = { ...body, content: [ping, String(body.content || "").trim()].filter(Boolean).join("\n").slice(0, 2000) };
      body = mergeRoleAllowedMentions(body, ping);
    }
    if (ping) body = injectMinigameRolePingIntoBody(body, ping);
    if (kind === "start" && opts?.type) body = appendStarWarsStartRewardLine(body, channel, opts.type);

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

/** True se l'URL è un allegato locale o un CDN Discord (dopo il primo send Discord risolve attachment:// → CDN). */
function isReplaceableRoundMediaUrl(u?, forceAll?) {
  if (forceAll) return true;
  const s = String(u || "").trim();
  if (!s) return true;
  if (s.startsWith("attachment://")) return true;
  return /cdn\.discordapp\.com|media\.discordapp\.net/i.test(s);
}

/**
 * Sostituisce le media del canvas round nei components V2.
 * `forceAll`: aggiorna anche URL CDN già risolti (necessario dopo attachments:[] sull'edit).
 */
function replaceV2AttachmentMedia(components?, nextUrl?, forceAll = false) {
  const url = String(nextUrl || "").trim();
  if (!url) return components;
  const swap = (list?) =>
    (Array.isArray(list) ? list : []).map((c?) => {
      if (!c || typeof c !== "object") return c;
      const out: any = { ...c };
      if (out.type === 12 && Array.isArray(out.items)) {
        out.items = out.items.map((i?) => {
          const u = String(i?.media?.url || "");
          if (isReplaceableRoundMediaUrl(u, forceAll)) return { ...i, media: { ...(i?.media || {}), url } };
          return i;
        });
      }
      if (out.type === 11) {
        const u = String(out.media?.url || "");
        if (isReplaceableRoundMediaUrl(u, forceAll)) out.media = { ...(out.media || {}), url };
      }
      if (out.accessory?.type === 11) {
        const u = String(out.accessory?.media?.url || "");
        if (isReplaceableRoundMediaUrl(u, forceAll)) {
          out.accessory = { ...out.accessory, media: { ...(out.accessory.media || {}), url } };
        }
      }
      if (Array.isArray(out.components)) out.components = swap(out.components);
      return out;
    });
  return swap(components);
}

function embedPlainDescription(embed?) {
  if (!embed) return "";
  try {
    if (typeof embed.toJSON === "function") return String(embed.toJSON()?.description || "").trim();
  } catch (_) {}
  return String(embed?.description || embed?.data?.description || "").trim();
}

function isMinigameStatusLine(content?) {
  const s = String(content || "");
  if (!s.trim()) return false;
  if (/Hai\s+.+\s+per\s+/i.test(s)) return true;
  if (/minuto/i.test(s) && /Hai/i.test(s)) return true;
  if (/pixeltime/i.test(s)) return true;
  if (/tempo\s+rimasto/i.test(s)) return true;
  return false;
}

/** Se arriva la description intera dell'embed, tieni solo la riga del timer. */
function statusLineFromText(statusText?) {
  const raw = String(statusText || "").trim();
  if (!raw) return "";
  const lines = raw.split(/\n+/).map((l?) => String(l || "").trim()).filter(Boolean);
  const hit = lines.find((l?) => isMinigameStatusLine(l));
  return (hit || raw).slice(0, 4000);
}

/** Aggiorna TextDisplay “status” (tempo rimasto / prompt) nei draft V2 custom. */
function patchV2StatusText(components?, statusText?) {
  const next = statusLineFromText(statusText);
  if (!next) return components;
  let patched = false;
  const walk = (list?) =>
    (Array.isArray(list) ? list : []).map((c?) => {
      if (!c || typeof c !== "object") return c;
      const out: any = { ...c };
      if (out.type === 10 && isMinigameStatusLine(out.content)) {
        patched = true;
        out.content = next;
      }
      if (Array.isArray(out.components)) out.components = walk(out.components);
      return out;
    });
  const result = walk(components);
  return patched ? result : components;
}

/**
 * Aggiorna l'immagine del round (hangman / canvas).
 * Con Components V2: gallery + files (+ TextDisplay status se `statusText` / embed.description).
 */
async function editMinigameRoundImage(
  gameMsg?,
  opts: { attachment?: any; embed?: any; files?: any[]; statusText?: string } = {},
) {
  if (!gameMsg?.edit) return false;
  const attachment = opts.attachment || null;
  const files = Array.isArray(opts.files) ? opts.files : attachment ? [attachment] : [];
  const name = String(attachment?.name || files[0]?.name || "").trim();
  const nextUrl = name ? `attachment://${name}` : "";
  const statusText = String(opts.statusText || embedPlainDescription(opts.embed) || "").trim();

  if (isComponentsV2Message(gameMsg)) {
    if (!nextUrl || !files.length) return false;
    const raw = (gameMsg.components || []).map((c?) => (typeof c?.toJSON === "function" ? c.toJSON() : c));
    /* forceAll: dopo il send Discord spesso ha già CDN; senza swap l'immagine resta rotta con attachments:[] */
    let components = replaceV2AttachmentMedia(raw, nextUrl, true);
    components = patchV2StatusText(components, statusText);
    const ok = await gameMsg
      .edit({
        components,
        files,
        attachments: [],
        embeds: [],
        flags: V2_FLAG,
      })
      .then(() => true)
      .catch((err?) => {
        warnMinigame(err);
        return false;
      });
    return ok;
  }

  /* Embed classici: se il draft/V2 non c'è, aggiorna embed + file. Fallback se edit con files fallisce. */
  if (opts.embed && attachment && !opts.embed.data?.image && typeof opts.embed.setImage === "function") {
    try {
      opts.embed.setImage(`attachment://${attachment.name}`);
    } catch (_) {}
  }
  const payload: Record<string, any> = {};
  if (opts.embed) payload.embeds = [opts.embed];
  if (files.length) {
    payload.files = files;
    payload.attachments = [];
  }
  const edited = await gameMsg
    .edit(payload)
    .then(() => true)
    .catch((err?) => {
      warnMinigame(err);
      return false;
    });
  if (edited || !files.length) return edited;
  /* Retry senza azzerare attachments (alcuni client Discord falliscono il re-bind) */
  return gameMsg
    .edit({ embeds: opts.embed ? [opts.embed] : undefined, files })
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

/** Fine round: togli bottoni/select dal messaggio di gioco (altrimenti restano cliccabili a vuoto). */
async function stripMinigameGameMessage(channel?, game?) {
  const mid = String(game?.gameMessageId || game?.messageId || "").trim();
  if (!channel?.messages?.fetch || !mid) return false;
  try {
    const msg = await channel.messages.fetch(mid).catch(() => null);
    if (!msg) return false;
    const { stripMessageComponents } = require("../../../shared/discord/safeMessageEdit") as typeof import("../../../shared/discord/safeMessageEdit");
    const out = await stripMessageComponents(msg);
    return Boolean(out?.ok);
  } catch (err) {
    warnMinigame(err);
    return false;
  }
}

export = {
  MINIGAME_CORRECT_FALLBACK_EMOJI,
  MINIGAME_WRONG_EMOJI,
  sendMinigameMessage,
  editMinigameRoundImage,
  replaceV2AttachmentMedia,
  stripMinigameGameMessage,
  reactMinigameWin,
  reactMinigameWrongEmoji,
};
