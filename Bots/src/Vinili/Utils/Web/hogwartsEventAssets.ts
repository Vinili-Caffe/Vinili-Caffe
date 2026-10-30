const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { HOUSE_META } = require("./hogwartsSortingBank") as typeof import("./hogwartsSortingBank");
const HOGWARTS_IMG_DIR = path.resolve(__dirname, "../../Assets/evento-hogwarts");
const DEFAULT_SITE_URL = "https://www.viniliecaffe.it";

function hogwartsImageDirs() {
  const dirs = [];
  const envDir = String(process.env.VC_HOGWARTS_IMG_DIR || "").trim();
  if (envDir) dirs.push(path.resolve(envDir));
  dirs.push(HOGWARTS_IMG_DIR);
  const vinylsRoot = path.resolve(__dirname, "../..");
  dirs.push(path.join(vinylsRoot, "Assets", "evento-hogwarts"));
  dirs.push(path.join(vinylsRoot, "assets", "evento-hogwarts"));
  const cwd = path.resolve(process.cwd());
  dirs.push(path.join(cwd, "Vinili", "Assets", "evento-hogwarts"));
  dirs.push(path.join(cwd, "Vinili", "assets", "evento-hogwarts"));
  dirs.push("/var/www/viniliecaffe/images/evento-hogwarts");
  dirs.push("/var/www/viniliecaffe-react/images/evento-hogwarts");
  return [...new Set(dirs.map((d?) => path.resolve(d)))];
}

function findHogwartsAssetPath(relativePath?) {
  const rel = String(relativePath || "").trim().replace(/\\/g, "/");
  if (!rel) return null;
  const baseName = path.basename(rel).toLowerCase();
  for (const dir of hogwartsImageDirs()) {
    const direct = path.join(dir, ...rel.split("/"));
    if (fs.existsSync(direct)) return direct;
    const parent = path.dirname(direct);
    try {
      if (!fs.existsSync(parent)) continue;
      const hit = fs.readdirSync(parent).find((entry?) => String(entry).toLowerCase() === baseName);
      if (hit) return path.join(parent, hit);
    } catch {
    }
  }
  return null;
}

function resolveSitePublicUrl(client?) {
  const fromEnv = String(process.env.WEBSITE_PUBLIC_URL || "").trim();
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv.replace(/\/+$/, "");
  const fromClient = String(client?.config?.siteUrl || client?.config?.websiteUrl || "").trim();
  if (/^https?:\/\//i.test(fromClient)) return fromClient.replace(/\/+$/, "");
  return DEFAULT_SITE_URL;
}

function buildImageAttachmentFromRelativePath(relativePath?, attachBaseName?) {
  const rel = String(relativePath || "").trim();
  if (!rel) return null;
  const filePath = findHogwartsAssetPath(rel);
  if (!filePath) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return null;
  const safeBase = String(attachBaseName || path.basename(filePath, ext) || "hogwarts")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "hogwarts";
  const attachName = `vc-${safeBase}${ext || ".png"}`;
  return {
    attachment: new AttachmentBuilder(filePath, { name: attachName }),
    url: `attachment://${attachName}`,
  };
}

function buildShopItemImageAttachment(imageFile?) {
  const file = String(imageFile || "").trim();
  if (!file) return null;
  return (
    buildImageAttachmentFromRelativePath(file, `shop-${path.basename(file, path.extname(file))}`) ||
    buildImageAttachmentFromRelativePath(file.replace(/_/g, " "), `shop-${path.basename(file, path.extname(file))}`)
  );
}

function resolveShopItemPublicImageUrl(client?, imageFile?) {
  const file = String(imageFile || "").trim();
  if (!file) return "";
  const cdn = String(process.env.VC_PHOTOS_CDN_ORIGIN || "https://cdn.viniliecaffe.it").trim().replace(/\/+$/, "");
  const segments = file.split("/").map((part?) => encodeURIComponent(part));
  return `${cdn}/images/evento-hogwarts/${segments.join("/")}`;
}

function normalizeHouseId(value?) {
  const house = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(HOUSE_META, house) ? house : "";
}

function buildHouseCrestAttachment(houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return null;
  const crestFile = String(HOUSE_META[house]?.crestFile || `${house}.png`).trim();
  const candidates = [`crests/${crestFile}`, `crests/${house}.png`];
  for (const rel of candidates) {
    const built = buildImageAttachmentFromRelativePath(rel, `${house}-crest`);
    if (built) return built;
  }
  return null;
}

function resolveHouseCrestPublicUrl(client?, houseId?, customCrestUrl?) {
  const custom = String(customCrestUrl || "").trim();
  if (/^https?:\/\//i.test(custom)) return custom;
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const cdn = String(process.env.VC_PHOTOS_CDN_ORIGIN || "https://cdn.viniliecaffe.it").trim().replace(/\/+$/, "");
  const file = String(HOUSE_META[house]?.crestFile || `${house}.png`).trim();
  return `${cdn}/images/evento-hogwarts/crests/${encodeURIComponent(file)}`;
}

function resolveHouseCrestEmbedAssets(client?, houseId?, customCrestUrl?) {
  const crestAttach = buildHouseCrestAttachment(houseId);
  if (crestAttach) {
    return { thumbnail: crestAttach.url, files: [crestAttach.attachment] };
  }
  const thumbnail = resolveHouseCrestPublicUrl(client, houseId, customCrestUrl);
  return { thumbnail, files: [] };
}

export = { findHogwartsAssetPath, buildImageAttachmentFromRelativePath, buildShopItemImageAttachment, buildHouseCrestAttachment, resolveShopItemPublicImageUrl, resolveHouseCrestPublicUrl, resolveHouseCrestEmbedAssets, resolveSitePublicUrl };