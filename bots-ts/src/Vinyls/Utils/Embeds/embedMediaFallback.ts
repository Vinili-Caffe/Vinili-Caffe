const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { discordDefaultAvatarUrl } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");

const MEDIA_AVATAR_RE = /media\.discordapp\.net\/avatars\/(\d{5,24})\//i;
const GUILD_ICON_RE = /cdn\.discordapp\.com\/icons\/(\d{5,24})\//i;
const BAD_TOKEN_RE = /(?:^|\/)(?:null|undefined|NaN)(?:\/|\.|$)/i;

function clampSize(size?) {
  const n = Math.floor(Number(size) || 256);
  if (![16, 32, 64, 128, 256, 512, 1024, 2048, 4096].includes(n)) return 256;
  return n;
}

function defaultAvatarUrl(userId?, size = 256) {
  return discordDefaultAvatarUrl({ id: String(userId || "").trim() || "0" }, { size: clampSize(size) });
}

function extractUserIdFromUrl(url?) {
  const s = String(url || "");
  let m = s.match(/\/avatars\/(\d{5,24})\//i);
  if (m) return m[1];
  m = s.match(/\/users\/(\d{5,24})\/avatars\//i);
  if (m) return m[1];
  m = s.match(MEDIA_AVATAR_RE);
  if (m) return m[1];
  return "";
}

function isDiscordAvatarLikeUrl(url?) {
  const s = String(url || "");
  return (
    /cdn\.discordapp\.com\/(?:avatars\/\d{5,24}\/|guilds\/\d+\/users\/\d{5,24}\/avatars\/|embed\/avatars\/\d+\.png)/i.test(
      s,
    ) || MEDIA_AVATAR_RE.test(s)
  );
}

function isDiscordGuildIconUrl(url?) {
  return GUILD_ICON_RE.test(String(url || ""));
}

function isDiscordCdnUrl(url?) {
  return /(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(String(url || ""));
}

function sanitizeEmbedMediaUrl(url?, { preferDefaultOnBad = true, size = 256 } = {}) {
  let raw = String(url == null ? "" : url).trim();
  if (!raw || raw === "null" || raw === "undefined") return null;
  // Discord embed media requires https (or attachment/data). Upgrade plain http.
  if (/^http:\/\//i.test(raw)) raw = `https://${raw.slice("http://".length)}`;
  if (!/^https:\/\//i.test(raw) && !/^attachment:\/\//i.test(raw) && !/^data:/i.test(raw)) return null;
  if (/^attachment:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
  if (BAD_TOKEN_RE.test(raw)) {
    const uid = extractUserIdFromUrl(raw);
    return preferDefaultOnBad ? defaultAvatarUrl(uid || "0", size) : null;
  }

  try {
    const u = new URL(raw);
    const host = String(u.hostname || "").toLowerCase();
    const isCdn =
      host === "cdn.discordapp.com" ||
      host === "media.discordapp.net" ||
      host.endsWith(".discordapp.net") ||
      host.endsWith(".discordapp.com");

    if (!isCdn) return raw;

    if (host === "media.discordapp.net" || (host.endsWith(".discordapp.net") && host !== "cdn.discordapp.com")) {
      u.hostname = "cdn.discordapp.com";
    }

    const path = u.pathname || "";
    const avatarLike =
      /\/avatars\/\d{5,24}\//i.test(path) ||
      /\/users\/\d{5,24}\/avatars\//i.test(path) ||
      /\/embed\/avatars\/\d+\.png$/i.test(path);
    const iconLike = /\/icons\/\d{5,24}\//i.test(path);

    if (avatarLike || iconLike) {
      u.pathname = path.replace(/\.(webp|gif|jpeg|jpg)(?:$|(?=\?))/i, ".png");
      if (!/\.png$/i.test(u.pathname) && /\/embed\/avatars\/\d+$/i.test(u.pathname)) {
        u.pathname = `${u.pathname}.png`;
      }
      u.searchParams.set("size", String(clampSize(size)));
      if (/\/avatars\/\d{5,24}\/(?:\.png)?$/i.test(u.pathname) || /\/avatars\/\d{5,24}\/\.png$/i.test(u.pathname)) {
        return preferDefaultOnBad ? defaultAvatarUrl(extractUserIdFromUrl(u.href), size) : null;
      }
      return u.toString();
    }

    return u.toString();
  } catch {
    const uid = extractUserIdFromUrl(raw);
    return preferDefaultOnBad && (isDiscordAvatarLikeUrl(raw) || uid)
      ? defaultAvatarUrl(uid || "0", size)
      : null;
  }
}

function sanitizeAuthor(author?) {
  if (!author || typeof author !== "object") return author;
  const next = { ...author };
  const icon = sanitizeEmbedMediaUrl(next.iconURL ?? next.icon_url, { size: 256 });
  delete next.icon_url;
  if (icon) next.iconURL = icon;
  else delete next.iconURL;
  return next;
}

function sanitizeFooter(footer?) {
  if (!footer || typeof footer !== "object") return footer;
  const next = { ...footer };
  const icon = sanitizeEmbedMediaUrl(next.iconURL ?? next.icon_url, { size: 64 });
  delete next.icon_url;
  if (icon) next.iconURL = icon;
  else delete next.iconURL;
  return next;
}

function sanitizeEmbedDataObject(data?) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const next = { ...data };

  if (next.author) {
    const author = { ...next.author };
    const icon = sanitizeEmbedMediaUrl(author.icon_url ?? author.iconURL, { size: 256 });
    if (icon) author.icon_url = icon;
    else delete author.icon_url;
    delete author.iconURL;
    next.author = author;
  }

  if (next.footer) {
    const footer = { ...next.footer };
    const icon = sanitizeEmbedMediaUrl(footer.icon_url ?? footer.iconURL, { size: 64 });
    if (icon) footer.icon_url = icon;
    else delete footer.icon_url;
    delete footer.iconURL;
    next.footer = footer;
  }

  if (next.thumbnail?.url != null) {
    const url = sanitizeEmbedMediaUrl(next.thumbnail.url, { size: 256 });
    if (url) next.thumbnail = { ...next.thumbnail, url };
    else delete next.thumbnail;
  }

  if (next.image?.url != null) {
    const url = sanitizeEmbedMediaUrl(next.image.url, { size: 512 });
    if (url) next.image = { ...next.image, url };
    else delete next.image;
  }

  return next;
}

function embedHasMeaningfulContent(embed?) {
  if (!embed) return false;
  const data =
    embed?.data && typeof embed.data === "object" && !Array.isArray(embed.data)
      ? embed.data
      : embed;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (String(data.title || "").trim()) return true;
  if (String(data.description || "").trim()) return true;
  if (String(data.url || "").trim()) return true;
  if (String(data.image?.url || "").trim()) return true;
  if (String(data.thumbnail?.url || "").trim()) return true;
  if (String(data.video?.url || "").trim()) return true;
  if (Array.isArray(data.fields) && data.fields.some((f?) => String(f?.name || f?.value || "").trim())) {
    return true;
  }
  const author = data.author;
  if (author && typeof author === "object") {
    if (String(author.name || "").trim()) return true;
    if (String(author.icon_url || author.iconURL || "").trim()) return true;
  }
  return false;
}

function filterMeaningfulEmbeds(embeds?) {
  if (!Array.isArray(embeds)) return [];
  return embeds.filter((emb?) => embedHasMeaningfulContent(emb));
}

function sanitizeEmbedInstance(embed?) {
  if (!embed) return embed;
  if (typeof embed.data === "object" && embed.data) {
    const cleaned = sanitizeEmbedDataObject(embed.data);
    for (const key of Object.keys(embed.data)) {
      if (!(key in cleaned)) delete embed.data[key];
    }
    Object.assign(embed.data, cleaned);
    return embed;
  }
  if (typeof embed === "object" && !Array.isArray(embed)) {
    return sanitizeEmbedDataObject(embed);
  }
  return embed;
}

function applyEmbedMediaFallbackToPayload(payload?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!Array.isArray(payload.embeds) || !payload.embeds.length) return payload;
  const embeds = payload.embeds
    .map((emb?) => {
      if (!emb) return null;
      if (typeof emb.toJSON === "function" || emb.data) {
        sanitizeEmbedInstance(emb);
        return emb;
      }
      return sanitizeEmbedDataObject(emb);
    })
    .filter((emb?) => embedHasMeaningfulContent(emb));
  if (!embeds.length) {
    const next = { ...payload };
    delete next.embeds;
    return next;
  }
  return { ...payload, embeds };
}

function installEmbedMediaFallbackPatch() {
  if (!EmbedBuilder || typeof EmbedBuilder !== "function") return;
  if (EmbedBuilder.prototype.__viniliEmbedMediaFallbackPatched) return;

  const proto = EmbedBuilder.prototype;

  if (typeof proto.setAuthor === "function") {
    const original = proto.setAuthor;
    proto.setAuthor = function setAuthorWithAvatarFallback(author?, ...rest) {
      return original.call(this, sanitizeAuthor(author), ...rest);
    };
  }

  if (typeof proto.setFooter === "function") {
    const original = proto.setFooter;
    proto.setFooter = function setFooterWithAvatarFallback(footer?, ...rest) {
      return original.call(this, sanitizeFooter(footer), ...rest);
    };
  }

  if (typeof proto.setThumbnail === "function") {
    const original = proto.setThumbnail;
    proto.setThumbnail = function setThumbnailWithAvatarFallback(url?, ...rest) {
      if (url && typeof url === "object" && url.url != null) {
        const cleaned = sanitizeEmbedMediaUrl(url.url, { size: 256 });
        if (!cleaned) return this;
        return original.call(this, { ...url, url: cleaned }, ...rest);
      }
      const cleaned = sanitizeEmbedMediaUrl(url, { size: 256 });
      if (!cleaned) return this;
      return original.call(this, cleaned, ...rest);
    };
  }

  if (typeof proto.setImage === "function") {
    const original = proto.setImage;
    proto.setImage = function setImageWithAvatarFallback(url?, ...rest) {
      if (url && typeof url === "object" && url.url != null) {
        const cleaned = sanitizeEmbedMediaUrl(url.url, { size: 512 });
        if (!cleaned) return this;
        return original.call(this, { ...url, url: cleaned }, ...rest);
      }
      const cleaned = sanitizeEmbedMediaUrl(url, { size: 512 });
      if (!cleaned) return this;
      return original.call(this, cleaned, ...rest);
    };
  }

  EmbedBuilder.prototype.__viniliEmbedMediaFallbackPatched = true;
}

export = {
  sanitizeEmbedMediaUrl,
  sanitizeEmbedDataObject,
  sanitizeEmbedInstance,
  embedHasMeaningfulContent,
  filterMeaningfulEmbeds,
  applyEmbedMediaFallbackToPayload,
  installEmbedMediaFallbackPatch,
  isDiscordAvatarLikeUrl,
  isDiscordGuildIconUrl,
  isDiscordCdnUrl,
  defaultAvatarUrl,
};
