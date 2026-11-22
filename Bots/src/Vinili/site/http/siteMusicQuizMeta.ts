/** Music Quiz: impostazioni dei quiz creati dagli utenti (categoria, lingue, tag, visibilità, autore, copertina). */
const crypto = require("crypto") as typeof import("crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { resolveSiteUploadRoot } = require("./siteUploadRoots") as typeof import("./siteUploadRoots");
const { savePublicSiteMedia, cdnUrlForKey } = require("./siteCdnMedia") as typeof import("./siteCdnMedia");

export const CATEGORIES = [
  "general",
  "pop",
  "rap",
  "rock",
  "metal",
  "electronic",
  "jazz",
  "retro",
  "soundtrack",
  "anime",
  "kpop",
  "world",
] as const;

export const LANGUAGES = ["it", "en", "es", "fr", "de", "pt", "ja", "ko", "other"] as const;

const COVER_ROOT = resolveSiteUploadRoot("site-music-quiz");
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;

/** Legge e ripulisce le impostazioni mandate dal sito. */
export function readQuizMeta(body: any) {
  const language = pick(LANGUAGES, body?.language, "it");
  const languages = Array.isArray(body?.languages)
    ? [...new Set(body.languages.map((x: unknown) => String(x)).filter((x: string) => (LANGUAGES as readonly string[]).includes(x) && x !== language))].slice(0, 4)
    : [];
  const tags = Array.isArray(body?.tags)
    ? [
        ...new Set(
          body.tags
            .map((t: unknown) =>
              String(t || "")
                .replace(/^#+/, "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase()
                .slice(0, 24),
            )
            .filter((t: string) => t.length >= 2),
        ),
      ].slice(0, 8)
    : [];
  return {
    description: String(body?.description || "")
      .replace(/\s+\n/g, "\n")
      .trim()
      .slice(0, 300),
    category: pick(CATEGORIES, body?.category, "general"),
    language,
    languages: languages as string[],
    tags: tags as string[],
    visibility: body?.visibility === "unlisted" ? ("unlisted" as const) : ("public" as const),
    anonymous: Boolean(body?.anonymous),
  };
}

function extFor(mime: string) {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
}

/** Copertina caricata come data URL: va sul CDN (o su disco se il CDN non risponde). Errore → messaggio. */
export async function saveQuizCover(userId: string, dataUrl: unknown): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || "").trim());
  if (!m) return { ok: false, message: "La copertina deve essere un'immagine JPG, PNG, GIF o WEBP." };
  let mime = m[1]!.toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!COVER_MIME.has(mime)) return { ok: false, message: "La copertina deve essere un'immagine JPG, PNG, GIF o WEBP." };
  const buffer = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > COVER_MAX_BYTES) return { ok: false, message: "La copertina può pesare al massimo 5 MB." };
  const uid = String(userId || "").replace(/\D/g, "") || "0";
  const name = `cover-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${extFor(mime)}`;
  const saved = await savePublicSiteMedia({
    diskPath: path.join(COVER_ROOT, uid, name),
    buffer,
    cdnKey: `uploads/site-music-quiz/${uid}/${name}`,
    contentType: mime,
    fallbackUrl: `/webhooks/site-music-quiz/files/${uid}/${name}`,
  });
  return { ok: true, url: saved.url };
}

/** Copertine salvate su disco quando il CDN non era disponibile. */
export function serveQuizCover(req?: any, res?: any) {
  const uid = String(req?.params?.userId || "");
  const name = String(req?.params?.fileName || "");
  if (!/^\d{1,32}$/.test(uid) || !/^[a-z0-9._-]+$/i.test(name)) return res.status(404).end();
  const full = path.join(COVER_ROOT, uid, name);
  if (full.startsWith(path.join(COVER_ROOT, uid)) && fs.existsSync(full)) {
    const ext = path.extname(name).toLowerCase();
    res.setHeader("Content-Type", ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(fs.readFileSync(full));
  }
  const cdn = cdnUrlForKey(`uploads/site-music-quiz/${uid}/${name}`);
  if (cdn) return res.redirect(301, cdn);
  return res.status(404).end();
}

/** Campi pubblici delle impostazioni: chi ha scelto «Anonimo» non compare mai. */
export function publicMeta(p: any) {
  const payload = p?.payload || {};
  const anonymous = Boolean(payload.anonymous);
  return {
    description: String(payload.description || ""),
    category: String(payload.category || ""),
    language: String(payload.language || ""),
    languages: Array.isArray(payload.languages) ? payload.languages : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    visibility: payload.visibility === "unlisted" ? "unlisted" : "public",
    anonymous,
    authorName: anonymous ? "" : String(p?.authorName || ""),
    authorAvatarUrl: anonymous ? "" : String(p?.authorAvatarUrl || ""),
  };
}
