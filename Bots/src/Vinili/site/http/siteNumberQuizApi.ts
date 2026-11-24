/** Number Quiz («più o meno»): categorie create dagli utenti. Leggere e giocare è libero, creare serve essere nel server. */
const { requireMusicQuizHighStaff, sendAuthError, normalizeHeaderSecret } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

const MIN_ITEMS = 6;
const MAX_ITEMS = 150;
const TYPE = SITE_DOCUMENT_TYPE.NUMBER_QUIZ_PACK;

function slugify(raw: string) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function cleanImage(v: unknown) {
  const s = String(v || "").trim();
  return /^https:\/\/[^\s"'<>]{4,400}$/i.test(s) ? s : "";
}

function readItems(body: any) {
  const raw = Array.isArray(body?.items) ? body.items : [];
  const seen = new Set<string>();
  const out: { name: string; value: number; sub: string; image: string }[] = [];
  for (const it of raw) {
    const name = text(it?.name, 60);
    const value = Number(String(it?.value ?? "").replace(",", "."));
    if (!name || !Number.isFinite(value) || Math.abs(value) > 1e15) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, value, sub: text(it?.sub, 60), image: cleanImage(it?.image) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function serialize(p: any, viewerId?: string, withItems = false) {
  const payload = p?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    slug: String(p.boardSlug),
    title: String(p.title || ""),
    description: String(payload.description || ""),
    emoji: String(payload.emoji || "🔢"),
    unit: String(payload.unit || ""),
    more: String(payload.more || "Di più"),
    less: String(payload.less || "Di meno"),
    plain: Boolean(payload.plain),
    plays: Number(payload.plays || 0),
    itemCount: items.length,
    authorName: payload.anonymous ? "" : String(p.authorName || ""),
    mine: Boolean(viewerId && String(p.userId || "") === String(viewerId)),
    community: true,
    ...(withItems ? { items } : {}),
  };
}

/* chi guarda senza login vede tutto lo stesso; con il login si sa quali categorie sono sue */
async function viewerId(client?, req?) {
  if (!normalizeHeaderSecret(req?.headers?.authorization)) return "";
  try {
    const auth = await requireMusicQuizHighStaff(client, req);
    return auth.ok ? auth.userId : "";
  } catch {
    return "";
  }
}

async function handleNumberQuizListGet(client?, req?, res?) {
  try {
    const me = await viewerId(client, req);
    const docs = await SiteDocument.find({ docType: TYPE }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ ok: true, packs: docs.map((d) => serialize(d, me)) });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] list:", err?.message || err);
    return res.status(500).json({ ok: false, error: "list_error" });
  }
}

async function handleNumberQuizPackGet(client?, req?, res?) {
  try {
    const slug = String(req.params?.slug || "").trim();
    const doc = await SiteDocument.findOne({ docType: TYPE, boardSlug: slug }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "not_found", message: "Questa categoria non esiste più." });
    const me = await viewerId(client, req);
    return res.json({ ok: true, pack: serialize(doc, me, true) });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] get:", err?.message || err);
    return res.status(500).json({ ok: false, error: "get_error" });
  }
}

async function handleNumberQuizPlayPost(client?, req?, res?) {
  try {
    const slug = String(req.params?.slug || "").trim();
    await SiteDocument.updateOne({ docType: TYPE, boardSlug: slug }, { $inc: { "payload.plays": 1 } });
  } catch {
    /* il contatore non è importante */
  }
  return res.json({ ok: true });
}

async function handleNumberQuizCreatePost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const body = req.body || {};
    const title = text(body.title, 70);
    if (title.length < 3) return res.status(400).json({ ok: false, error: "missing_title", message: "Dai un nome alla categoria." });
    const items = readItems(body);
    if (items.length < MIN_ITEMS) {
      return res.status(400).json({ ok: false, error: "few_items", message: `Servono almeno ${MIN_ITEMS} voci con un numero.` });
    }
    const mine = await SiteDocument.countDocuments({ docType: TYPE, userId: auth.userId });
    if (mine >= 30) return res.status(400).json({ ok: false, error: "too_many", message: "Hai già creato 30 categorie: eliminane una per farne un'altra." });

    const base = slugify(title) || `numeri-${Date.now().toString(36)}`;
    let slug = `u-${base}`;
    for (let n = 1; await SiteDocument.exists({ docType: TYPE, boardSlug: slug }); n += 1) slug = `u-${base}-${n}`;

    const doc = await SiteDocument.create({
      docType: TYPE,
      boardSlug: slug,
      title,
      userId: auth.userId,
      authorName: auth.displayName,
      authorAvatarUrl: auth.avatarUrl,
      createdBy: "community",
      payload: {
        description: text(body.description, 160),
        emoji: text(body.emoji, 8) || "🔢",
        unit: text(body.unit, 20),
        more: text(body.more, 20) || "Di più",
        less: text(body.less, 20) || "Di meno",
        plain: Boolean(body.plain),
        anonymous: Boolean(body.anonymous),
        items,
        plays: 0,
      },
    });
    return res.json({ ok: true, pack: serialize(doc.toObject ? doc.toObject() : doc, auth.userId, true) });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] create:", err?.message || err);
    return res.status(500).json({ ok: false, error: "create_error" });
  }
}

async function handleNumberQuizDelete(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const slug = String(req.params?.slug || "").trim();
    const r = await SiteDocument.deleteOne({ docType: TYPE, boardSlug: slug, userId: auth.userId });
    if (!r.deletedCount) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi eliminare solo le categorie che hai creato tu." });
    }
    return res.json({ ok: true });
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] delete:", err?.message || err);
    return res.status(500).json({ ok: false, error: "delete_error" });
  }
}

export = {
  handleNumberQuizListGet,
  handleNumberQuizPackGet,
  handleNumberQuizPlayPost,
  handleNumberQuizCreatePost,
  handleNumberQuizDelete,
};
