/** Minigiochi: fetch immagini remote, normalizzazione testo e metadati artista. */
const axios = require("axios") as any;
const { safeLoadImage } = require("../../Utils/Render/safeLoadImage") as typeof import("../../Utils/Render/safeLoadImage");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");

const regionImageCache = new Map();
const singerImageFallbackCache = new Map();
const SINGER_IMAGE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeCountryName(raw?) {
  const specials = { "\u00df": "ss", "\u1e9e": "ss", "\u00e6": "ae", "\u00c6": "ae", "\u0153": "oe", "\u0152": "oe", "\u00f8": "o", "\u00d8": "o", "\u00e5": "a", "\u00c5": "a", "\u0142": "l", "\u0141": "l", "\u0111": "d", "\u0110": "d", "\u00f0": "d", "\u00d0": "d", "\u00fe": "th", "\u00de": "th", };
  const replaced = String(raw || "").replace(/[\u00df\u1e9e\u00e6\u00c6\u0153\u0152\u00f8\u00d8\u00e5\u00c5\u0142\u0141\u0111\u0110\u00f0\u00d0\u00fe\u00de]/g, (ch?) => specials[ch] || ch,);
  return replaced
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function polishItalianQuestionText(value?) {
  const src = String(value || "").replace(/\s+/g, " ").trim();
  if (!src) return "";
  return src
    .replace(/\bd\s+Italia\b/gi, "d'Italia")
    .replace(/\bl\s+Italia\b/gi, "l'Italia")
    .replace(/\bl\s+unità\b/gi, "l'unità")
    .replace(/\bQual e\b/gi, "Qual è")
    .replace(/\bpiu\b/gi, "più");
}

async function fetchWikiRegionImage(regionName?) {
  const normalized = String(regionName || "").trim();
  if (!normalized) return null;
  if (regionImageCache.has(normalized)) return regionImageCache.get(normalized);

  const titles = [normalized, `${normalized}(regione italiana)`,
    `Regione ${normalized}`,
  ];

  for (const title of titles) {
    const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await axios.get(url, { timeout: 12000 });
      const image = res?.data?.thumbnail?.source || res?.data?.originalimage?.source || null;
      if (image) {
        regionImageCache.set(normalized, image);
        return image;
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  regionImageCache.set(normalized, null);
  return null;
}

function isDeezerArtistPlaceholderImage(url?) {
  const value = String(url || "").trim();
  if (!value) return true;
  if (!/^https?:\/\//i.test(value)) return true;
  if (/api\.deezer\.com\/artist\/\d+\/image/i.test(value)) return true;
  if (/\/images\/artist\/\/+/i.test(value)) return true;
  if (/\/images\/artist\/[^/]+\/\d+x\d+-000000-80-0-0\.(jpg|png|webp)$/i.test(value))
    return true;
  return false;
}

function pickBestSingerImage(artist?) {
  const candidates = [artist?.picture_xl, artist?.picture_big, artist?.picture_medium, artist?.picture_small, artist?.picture,].filter(Boolean);
  for (const candidate of candidates) {
    if (!isDeezerArtistPlaceholderImage(candidate)) return candidate;
  }
  return null;
}

async function fetchSingerImageFallback(name?, cfg?) {
  const artistName = String(name || "").trim();
  if (!artistName) return null;

  const cacheKey = normalizeCountryName(artistName);
  const cached = singerImageFallbackCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SINGER_IMAGE_FALLBACK_TTL_MS) {
    return cached.url || null;
  }

  const fallbackApi = cfg?.guessSinger?.fallbackApiUrl || "https://www.theaudiodb.com/api/v1/json/2/search.php";
  try {
    const res = await axios.get(fallbackApi, { params: { s: artistName }, timeout: 15000, });
    const artists = Array.isArray(res?.data?.artists) ? res.data.artists : [];
    const best = artists.find((a?) => normalizeCountryName(a?.strArtist) === normalizeCountryName(artistName),);
    const picked = best || artists[0];
    const fallbackUrl = picked?.strArtistThumb || picked?.strArtistFanart || picked?.strArtistFanart2 || picked?.strArtistFanart3 || null;
    const url = isDeezerArtistPlaceholderImage(fallbackUrl) ? null : fallbackUrl;
    singerImageFallbackCache.set(cacheKey, { url, at: Date.now() });
    return url;
  } catch {
    singerImageFallbackCache.set(cacheKey, { url: null, at: Date.now() });
    return null;
  }
}

let loadImage = null;
try {
  loadImage = require("canvas").loadImage;
} catch {
  loadImage = async () => {
    throw new Error("canvas_non_disponibile");
  };
}

/** Marker: sports_guess_attach_v1 — always attach puzzle image (Discord often fails to unfurl r2.thesportsdb.com). */
function normalizeExternalImageUrl(imageUrl?) {
  let url = String(imageUrl || "").trim();
  if (!url) return null;
  if (/^http:\/\//i.test(url)) url = `https://${url.slice("http://".length)}`;
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

async function loadImageBufferFromUrl(imageUrl?) {
  const url = normalizeExternalImageUrl(imageUrl);
  if (!url) return null;
  try {
    const viaSafe = await safeLoadImage(url, { suppressWarning: true });
    if (viaSafe?.width && viaSafe?.height) return viaSafe;
  } catch (_) {}
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { "User-Agent": "ViniliCaffeBot/1.0", Accept: "image/*,*/*" },
      validateStatus: (status?) => status >= 200 && status < 300,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf.length) return null;
    const img = await loadImage(buf).catch(() => null);
    if (img?.width && img?.height) return img;
  } catch (_) {}
  return null;
}

async function fetchRawImageAttachment(imageUrl?, fileName = "guess_image.jpg") {
  const url = normalizeExternalImageUrl(imageUrl);
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { "User-Agent": "ViniliCaffeBot/1.0", Accept: "image/*,*/*" },
      validateStatus: (status?) => status >= 200 && status < 300,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf || buf.length < 64) return null;
    let name = String(fileName || "guess_image.jpg").replace(/[^\w.\-]+/g, "_");
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isWebp = buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
    if (isPng) name = name.replace(/\.[^.]+$/, ".png");
    else if (isJpg) name = name.replace(/\.[^.]+$/, ".jpg");
    else if (isWebp) name = name.replace(/\.[^.]+$/, ".webp");
    else if (/\.png($|\?)/i.test(url)) name = name.replace(/\.[^.]+$/, ".png");
    else name = name.replace(/\.[^.]+$/, ".jpg");
    if (!/\.(png|jpe?g|webp)$/i.test(name)) name = `${name}.jpg`;
    return new AttachmentBuilder(buf, { name });
  } catch (_) {
    return null;
  }
}

function hasUsablePlayerImage(player?) {
  return Boolean(player?.strThumb || player?.strCutout || player?.strRender);
}

export = {
  normalizeCountryName,
  polishItalianQuestionText,
  fetchWikiRegionImage,
  pickBestSingerImage,
  fetchSingerImageFallback,
  loadImageBufferFromUrl,
  fetchRawImageAttachment,
  hasUsablePlayerImage,
};
