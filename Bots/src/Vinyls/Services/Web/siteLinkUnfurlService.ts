"use strict";

/**
 * Paste di link viniliecaffe.it → sopprime l’anteprima OG nativa e posta Components V2
 * (screenshot pagina + titolo/desc + bottoni). Path sconosciuto → “Pagina non trovata”.
 */

const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const {
  buildVcSitePageSharePayload,
  SITE_CAFFE_ACCENT_INT,
} = require("../../Utils/Embeds/vcPageEmbedV2") as typeof import("../../Utils/Embeds/vcPageEmbedV2");

const SITE_HOSTS = new Set(["www.viniliecaffe.it", "viniliecaffe.it"]);
const URL_RE = /https?:\/\/(?:www\.)?viniliecaffe\.it\/[^\s<>\]\)\"']*/gi;
const OG_CARD_VER = "20261025ogShot1";
const SITE_404_ACCENT_INT = 0xe07a5f;
const SITE_ORIGIN = "https://www.viniliecaffe.it";

let ogMetaCache = null;
let knownPathsCache = null;

function loadOgMeta() {
  if (ogMetaCache) return ogMetaCache;
  const candidates = [
    path.join(__dirname, "../../Config/og-meta.json"),
    path.join(__dirname, "../../../Vinyls/Config/og-meta.json"),
    "/opt/bot/Vinyls/Config/og-meta.json",
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      ogMetaCache = JSON.parse(fs.readFileSync(file, "utf8"));
      return ogMetaCache;
    } catch {
      /* next */
    }
  }
  ogMetaCache = {};
  return ogMetaCache;
}

function knownSitePaths() {
  if (knownPathsCache) return knownPathsCache;
  const meta = loadOgMeta();
  const set = new Set(["/", "/404/", "/wordle/", "/profilo/"]);
  for (const key of Object.keys(meta || {})) {
    let p = String(key || "/").trim() || "/";
    if (!p.startsWith("/")) p = `/${p}`;
    if (p.length > 1 && !p.endsWith("/")) p = `${p}/`;
    set.add(p);
    set.add(p.replace(/\/$/, "") || "/");
  }
  const indexCandidates = [
    path.join(__dirname, "../../../WebSite/public/og/index.json"),
    "/var/www/viniliecaffe-react/og/index.json",
    "/var/www/viniliecaffe/images/og/index.json",
  ];
  for (const file of indexCandidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const arr = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        let p = String(row?.path || "").trim();
        if (!p) continue;
        if (!p.startsWith("/")) p = `/${p}`;
        if (p.length > 1 && !p.endsWith("/")) p = `${p}/`;
        set.add(p);
      }
      break;
    } catch {
      /* next */
    }
  }
  knownPathsCache = set;
  return set;
}

function normalizeSitePath(pathname?) {
  let p = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && !p.endsWith("/")) p = `${p}/`;
  return p;
}

function pathToOgSlug(sitePath?) {
  const p = normalizeSitePath(sitePath);
  if (p === "/404/") return "404";
  const parts = p.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  return parts.join("-") || "home";
}

function ogCardUrl(sitePath?) {
  return `${SITE_ORIGIN}/og/${pathToOgSlug(sitePath)}.png?v=${OG_CARD_VER}`;
}

function isAssetOrApiPath(sitePath?) {
  const p = normalizeSitePath(sitePath);
  return /^(?:\/(?:_next|api|js|css|images|fonts|og|sw\.js|manifest\.webmanifest|favicon\.ico|apple-touch-icon)(?:\/|$))/i.test(
    p,
  );
}

function isKnownSitePath(sitePath?) {
  const p = normalizeSitePath(sitePath);
  if (isAssetOrApiPath(p)) return true; // non trattare come 404 pagina
  const known = knownSitePaths();
  if (known.has(p) || known.has(p.replace(/\/$/, "") || "/")) return true;
  return false;
}

function metaForPath(sitePath?) {
  const meta = loadOgMeta();
  const entry = meta[sitePath] || meta[sitePath.replace(/\/$/, "") || "/"] || null;
  const it = entry?.it || entry?.en || null;
  if (!it) {
    return {
      title: "Vinili & Caffè",
      description: "Community Discord italiana chill: vinili, caffè, musica e chiacchiere.",
    };
  }
  let title = String(it.title || "Vinili & Caffè").trim();
  if (title.includes("ǀ")) {
    const tail = title.split("ǀ").pop().trim();
    if (tail) title = tail;
  } else if (/vinili\s*&\s*caff/i.test(title)) {
    title = "Vinili & Caffè";
  }
  return {
    title,
    description: String(it.description || "").trim(),
  };
}

function extractFirstSiteUrl(content?) {
  const text = String(content || "");
  URL_RE.lastIndex = 0;
  const match = URL_RE.exec(text);
  if (!match) return null;
  let raw = match[0].replace(/[.,;:!?)]+$/g, "");
  try {
    const u = new URL(raw);
    if (!SITE_HOSTS.has(u.hostname.toLowerCase())) return null;
    u.hash = "";
    const sitePath = normalizeSitePath(u.pathname);
    u.pathname = sitePath;
    u.search = "";
    u.hostname = "www.viniliecaffe.it";
    u.protocol = "https:";
    return { href: u.toString(), path: sitePath };
  } catch {
    return null;
  }
}

function buildNotFoundPayload(guildId?) {
  return buildVcSitePageSharePayload({
    guildId,
    accentColor: SITE_404_ACCENT_INT,
    title: "Pagina non trovata",
    description:
      "Questo link non porta a nessuna pagina del sito. Torna alla home o entra sul server Discord.",
    pageUrl: `${SITE_ORIGIN}/`,
    imageUrl: ogCardUrl("/404/"),
    pageLabel: "Vai alla home",
    inviteLabel: "Entra su Discord",
    allowedMentions: { parse: [], repliedUser: false },
  });
}

function buildPayloadForSiteUrl(urlInfo?, guildId?) {
  if (!isKnownSitePath(urlInfo.path)) {
    return buildNotFoundPayload(guildId);
  }
  const { title, description } = metaForPath(urlInfo.path);
  return buildVcSitePageSharePayload({
    guildId,
    accentColor: SITE_CAFFE_ACCENT_INT,
    title,
    description,
    pageUrl: urlInfo.href,
    imageUrl: ogCardUrl(urlInfo.path),
    pageLabel: "Apri la pagina",
    inviteLabel: "Entra su Discord",
    allowedMentions: { parse: [], repliedUser: false },
  });
}

/**
 * Disabilitato: niente reply del bot sui paste di link sito.
 * Resta l’anteprima nativa Discord (OG / component-embed HTML).
 * @returns {Promise<boolean>}
 */
async function handleSiteLinkUnfurl(_message?) {
  return false;
}

/** @deprecated body conservato solo come riferimento; non chiamato. */
async function handleSiteLinkUnfurlLegacy(message?) {
  if (!message?.guild || message.author?.bot || message.webhookId || message.system) return false;
  if (message.__vcSiteUnfurlDone) return false;
  if (!message.channel?.isTextBased?.()) return false;

  const urlInfo = extractFirstSiteUrl(message.content);
  if (!urlInfo) return false;
  // asset/API: lascia l’anteprima nativa (o nessuna)
  if (isAssetOrApiPath(urlInfo.path)) return false;

  message.__vcSiteUnfurlDone = true;

  try {
    if (typeof message.suppressEmbeds === "function") {
      await message.suppressEmbeds(true).catch(() => null);
    } else if (message.editable) {
      await message.edit({ flags: MessageFlags.SuppressEmbeds }).catch(() => null);
    }
  } catch {
    /* ignore */
  }

  const payload: any = buildPayloadForSiteUrl(urlInfo, message.guild.id);
  const sendBody = {
    content: payload.content || undefined,
    components: payload.components,
    flags: payload.flags,
    allowedMentions: payload.allowedMentions || { parse: [], repliedUser: false },
    files: payload.files,
  };

  try {
    if (typeof message.reply === "function") {
      await message.reply(sendBody);
    } else {
      await message.channel.send(sendBody);
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[siteLinkUnfurl] send failed:", err?.message || err);
    return false;
  }
}

export = {
  handleSiteLinkUnfurl,
  extractFirstSiteUrl,
  metaForPath,
  buildPayloadForSiteUrl,
  isKnownSitePath,
  buildNotFoundPayload,
};
