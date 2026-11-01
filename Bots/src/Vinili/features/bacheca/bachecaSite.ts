/** Bacheca sul sito: sul server principale quote, repost, clip e 💀 non vanno più nel canale #bacheca
 *  ma sulla pagina /bacheca/ del sito. Qui: quando vale, id dei contenuti, media sul CDN, link e diretta.
 *  I server esterni (tenant) restano sul loro canale come prima. */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { putSiteCdnObject, isSiteCdnConfigured } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");

const SITE_BOARD_CHANNEL = "site";
const SITE_ORIGIN = "https://www.viniliecaffe.it";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** La bacheca del sito vale solo per il server principale (BACHECA_SITE=0 la spegne e si torna al canale). */
function isBachecaSiteGuild(guildId?) {
  if (String(process.env.BACHECA_SITE || "").trim() === "0") return false;
  const main = String(IDs.guilds?.main || "").trim();
  return Boolean(main) && String(guildId || "").trim() === main;
}

function isSiteBoardChannel(channelId?) {
  return String(channelId || "").trim() === SITE_BOARD_CHANNEL;
}

/** Id del contenuto sul sito: prende il posto dell'id del messaggio in bacheca. */
function newBachecaItemId() {
  return new mongoose.Types.ObjectId().toHexString();
}

function bachecaItemUrl(itemId?) {
  const id = String(itemId || "").trim();
  return id ? `${SITE_ORIGIN}/bacheca/?p=${encodeURIComponent(id)}` : `${SITE_ORIGIN}/bacheca/`;
}

function buildBachecaLinkButton(itemId?, label = "Vedi in Bacheca") {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(bachecaItemUrl(itemId)).setLabel(label).setEmoji("📌");
}

function buildBachecaLinkRow(itemId?, label = "Vedi in Bacheca") {
  return new ActionRowBuilder().addComponents(buildBachecaLinkButton(itemId, label));
}

function extFromName(name?, fallback = "bin") {
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : fallback;
}

function safeFileName(name?, fallback = "file") {
  const base = String(name || "").split("?")[0].split("/").pop() || fallback;
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || fallback;
}

/** Carica un buffer sul CDN: bacheca/<tipo>/<id>/<nome>. Ritorna l'URL o "" se il CDN non c'è o fallisce. */
async function putBachecaMedia(kind?, itemId?, fileName?, buffer?: Buffer, contentType?) {
  if (!isSiteCdnConfigured() || !Buffer.isBuffer(buffer) || !buffer.length) return "";
  const key = `bacheca/${String(kind || "post")}/${String(itemId || "x")}/${safeFileName(fileName)}`;
  const put = await putSiteCdnObject(key, buffer, contentType).catch(() => null);
  if (!put?.ok) {
    global.logger?.warn?.("[BACHECA] CDN upload failed:", key, (put as any)?.reason || "error");
    return "";
  }
  return String(put.url || "");
}

/** Scarica un allegato (URL fresco di Discord) e lo carica sul CDN. Se non riesce torna l'URL originale. */
async function mirrorUrlToBacheca(kind?, itemId?, url?, name?) {
  const src = String(url || "").trim();
  if (!src || !/^https?:\/\//i.test(src)) return src;
  if (/cdn\.viniliecaffe\.it/i.test(src)) return src;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return src;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_MEDIA_BYTES) return src;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES) return src;
    const fileName = name || `file.${extFromName(src)}`;
    const out = await putBachecaMedia(kind, itemId, fileName, buf, res.headers.get("content-type") || undefined);
    return out || src;
  } catch {
    return src;
  }
}

/** Avvisa le pagine aperte del sito: è arrivato o cambiato un contenuto. Solo tipo e id, mai i dati. */
function broadcastBachecaChanged(action?, itemId?) {
  try {
    const { broadcastSiteRealtime, notifyExternalSiteRealtime } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    const payload = {
      type: "bacheca_changed",
      action: String(action || "changed"),
      id: String(itemId || ""),
      at: new Date().toISOString(),
    };
    broadcastSiteRealtime(payload);
    notifyExternalSiteRealtime(payload);
  } catch (_) {}
}

export = {
  SITE_BOARD_CHANNEL,
  isBachecaSiteGuild,
  isSiteBoardChannel,
  newBachecaItemId,
  bachecaItemUrl,
  buildBachecaLinkButton,
  buildBachecaLinkRow,
  putBachecaMedia,
  mirrorUrlToBacheca,
  broadcastBachecaChanged,
};
