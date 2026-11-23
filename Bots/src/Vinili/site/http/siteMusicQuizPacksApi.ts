/** Music Quiz packs: lettura, creazione, modifica ed eliminazione dei quiz della community. */
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { ensureDeezerPack } = require("./siteMusicQuizApi") as typeof import("./siteMusicQuizApi");
const meta = require("./siteMusicQuizMeta") as typeof import("./siteMusicQuizMeta");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

const MIN_TRACKS = 5;
const MAX_TRACKS = 20;

function slugify(raw: string) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Il quiz è di chi lo guarda? (solo i quiz della community hanno un autore) */
function ownedBy(p: any, viewerId?: string) {
  return Boolean(viewerId && p?.payload?.community && String(p.userId || "") === String(viewerId));
}

function serializePack(p: any, viewerId?: string) {
  const payload = p?.payload || {};
  const mine = ownedBy(p, viewerId);
  return {
    slug: p.boardSlug,
    title: p.title,
    cover: p.boardIconUrl || payload.cover || "",
    kind: payload.kind || payload.source || "community",
    deezerId: payload.deezerId || "",
    community: Boolean(payload.community),
    plays: Number(payload.plays || 0),
    trackCount: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
    ...meta.publicMeta(p),
    /* chi ha scelto «Anonimo» non viene mai collegato al quiz */
    createdBy: payload.anonymous ? "" : p.userId || p.createdBy || "",
    mine,
    /* per la modifica: la copertina è stata caricata a mano o è quella del primo brano? */
    ...(mine ? { customCover: Boolean(payload.customCover) || /site-music-quiz/.test(String(p.boardIconUrl || "")) } : {}),
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          cover: t.cover,
          previewUrl: t.previewUrl,
          /* a chi l'ha creato serve tutto per modificarlo */
          ...(mine
            ? {
                artistId: t.artistId || "",
                start: Number(t.start || 0),
                answer: String(t.answer || ""),
                wrong: Array.isArray(t.wrong) ? t.wrong : [],
              }
            : {}),
        }))
      : [],
  };
}

/** Brani mandati dal sito, ripuliti: solo quelli con anteprima, con spezzone e risposte personalizzate. */
function readTracks(body: any) {
  const raw = Array.isArray(body?.tracks) ? body.tracks : [];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const t of raw) {
    const id = String(t?.id || "");
    if (!t?.previewUrl || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: String(t.title || ""),
      artist: String(t.artist || ""),
      artistId: String(t.artistId || ""),
      album: String(t.album || ""),
      cover: String(t.cover || ""),
      previewUrl: String(t.previewUrl || ""),
      /* domanda personalizzata: da che secondo parte lo spezzone e le risposte scritte a mano */
      start: Math.max(0, Math.min(25, Math.round(Number(t.start) * 10) / 10 || 0)),
      answer: String(t.answer || "").trim().slice(0, 90),
      wrong: Array.isArray(t.wrong)
        ? t.wrong
            .map((w: unknown) => String(w || "").trim().slice(0, 90))
            .filter(Boolean)
            .slice(0, 3)
        : [],
    });
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

const notFound = (res: any) => res.status(404).json({ ok: false, error: "not_found", message: "Questo quiz non esiste più." });

async function handleMusicQuizPackGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    const slug = String(req.params?.slug || req.query?.slug || "").trim().replace(/\/+$/, "");
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });

    let pack = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
      boardSlug: slug,
    }).lean();

    if (!pack) {
      const m = /^(artist|playlist)-(\d+)$/.exec(slug);
      if (m) {
        const created = await ensureDeezerPack(m[1] as "artist" | "playlist", m[2]!);
        if (created) pack = (created as any).toObject ? (created as any).toObject() : created;
      }
    }
    if (!pack) {
      global.logger?.warn?.(`[music-quiz] quiz non trovato: slug=${JSON.stringify(slug)}`);
      return res.status(404).json({
        ok: false,
        error: "not_found",
        message: /^(artist|playlist)-\d+$/.test(slug)
          ? "Deezer non ha abbastanza brani con l'anteprima per questo quiz."
          : "Questo quiz non esiste più.",
      });
    }
    return res.json({ ok: true, pack: serializePack(pack, (auth as any).userId) });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "pack_error", message: String(err?.message || "") });
  }
}

async function handleMusicQuizPackCreatePost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const body = req.body || {};
    const title = String(body.title || "").trim().slice(0, 80);
    if (!title) return res.status(400).json({ ok: false, error: "missing_title", message: "Dai un nome al quiz." });
    const settings = meta.readQuizMeta(body);
    const tracks = readTracks(body);
    if (tracks.length < MIN_TRACKS) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: `Servono almeno ${MIN_TRACKS} brani con anteprima.` });
    }

    const base = slugify(title) || `quiz-${Date.now().toString(36)}`;
    let slug = `c-${base}`;
    let n = 0;
    while (await SiteDocument.exists({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug })) {
      n += 1;
      slug = `c-${base}-${n}`;
    }

    let cover = String(tracks[0]?.cover || "");
    if (body.coverImage) {
      const up = await meta.saveQuizCover(auth.userId, body.coverImage);
      /* senza strictNullChecks l'unione non si restringe su `ok` */
      if (!up.ok) return res.status(400).json({ ok: false, error: "bad_cover", message: (up as { message: string }).message });
      cover = (up as { url: string }).url;
    }
    const pack = await SiteDocument.create({
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
      boardSlug: slug,
      title,
      boardIconUrl: cover,
      userId: auth.userId,
      authorName: auth.displayName,
      authorAvatarUrl: auth.avatarUrl,
      createdBy: "community",
      payload: {
        source: "community",
        kind: "community",
        community: true,
        cover,
        customCover: Boolean(body.coverImage),
        tracks,
        plays: 0,
        ...settings,
      },
    });

    return res.json({ ok: true, pack: serializePack(pack.toObject ? pack.toObject() : pack, auth.userId) });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] create pack:", err?.message || err);
    return res.status(500).json({ ok: false, error: "create_error" });
  }
}

/** Modifica completa di un proprio quiz: nome, impostazioni, copertina e domande. Il link resta lo stesso. */
async function handleMusicQuizPackUpdatePut(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const slug = String(req.params?.slug || "").trim();
    const pack: any = await SiteDocument.findOne({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug });
    if (!pack) return notFound(res);
    if (!ownedBy(pack, auth.userId)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi modificare solo i quiz che hai creato tu." });
    }
    const body = req.body || {};
    const title = String(body.title || "").trim().slice(0, 80);
    if (!title) return res.status(400).json({ ok: false, error: "missing_title", message: "Dai un nome al quiz." });
    const settings = meta.readQuizMeta(body);
    const tracks = readTracks(body);
    if (tracks.length < MIN_TRACKS) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: `Servono almeno ${MIN_TRACKS} brani con anteprima.` });
    }

    const payload = pack.payload || {};
    /* copertina: nuova se caricata, tolta se chiesto (torna quella del primo brano), altrimenti resta */
    let cover = String(pack.boardIconUrl || payload.cover || "");
    /* i quiz salvati prima di questo campo: una copertina caricata sta nella cartella dei quiz */
    let customCover = Boolean(payload.customCover) || /site-music-quiz/.test(cover);
    if (body.coverImage) {
      const up = await meta.saveQuizCover(auth.userId, body.coverImage);
      if (!up.ok) return res.status(400).json({ ok: false, error: "bad_cover", message: (up as { message: string }).message });
      cover = (up as { url: string }).url;
      customCover = true;
    } else if (body.removeCover || !customCover) {
      cover = String(tracks[0]?.cover || "");
      customCover = false;
    }

    pack.title = title;
    pack.boardIconUrl = cover;
    pack.payload = { ...payload, cover, customCover, tracks, ...settings };
    pack.markModified?.("payload");
    await pack.save();
    return res.json({ ok: true, pack: serializePack(pack.toObject ? pack.toObject() : pack, auth.userId) });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] update pack:", err?.message || err);
    return res.status(500).json({ ok: false, error: "update_error", message: "Non sono riuscito a salvare, riprova." });
  }
}

/** Elimina un proprio quiz, con la sua classifica. */
async function handleMusicQuizPackDelete(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const slug = String(req.params?.slug || "").trim();
    const pack: any = await SiteDocument.findOne({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug }).lean();
    if (!pack) return notFound(res);
    if (!ownedBy(pack, auth.userId)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi eliminare solo i quiz che hai creato tu." });
    }
    await SiteDocument.deleteOne({ _id: pack._id });
    await SiteDocument.deleteMany({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_SCORE, boardSlug: slug }).catch(() => {});
    global.logger?.info?.(`[music-quiz] quiz eliminato: ${slug} da ${auth.userId}`);
    return res.json({ ok: true });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] delete pack:", err?.message || err);
    return res.status(500).json({ ok: false, error: "delete_error", message: "Non sono riuscito a eliminarlo, riprova." });
  }
}

export = {
  handleMusicQuizPackGet,
  handleMusicQuizPackCreatePost,
  handleMusicQuizPackUpdatePut,
  handleMusicQuizPackDelete,
  serializePack,
  ownedBy,
};
