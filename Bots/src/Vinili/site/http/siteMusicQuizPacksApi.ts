/** Music Quiz packs: get by slug + create community pack. */
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { ensureDeezerPack } = require("./siteMusicQuizApi") as typeof import("./siteMusicQuizApi");
const deezer = require("./siteMusicQuizDeezer") as typeof import("./siteMusicQuizDeezer");
const meta = require("./siteMusicQuizMeta") as typeof import("./siteMusicQuizMeta");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

function slugify(raw: string) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function serializePack(p: any) {
  const payload = p?.payload || {};
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
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          cover: t.cover,
          previewUrl: t.previewUrl,
        }))
      : [],
  };
}

async function handleMusicQuizPackGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    let slug = String(req.params?.slug || req.query?.slug || "").trim().replace(/\/+$/, "");
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
    return res.json({ ok: true, pack: serializePack(pack) });
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
    const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const rawTracks = Array.isArray(body.tracks) ? body.tracks : [];
    if (!title) return res.status(400).json({ ok: false, error: "missing_title", message: "Dai un nome al quiz." });
    const settings = meta.readQuizMeta(body);

    let tracks: any[] = [];
    if (rawTracks.length) {
      tracks = rawTracks
        .map((t: any) =>
          t?.previewUrl
            ? {
                id: String(t.id || ""),
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
              }
            : null,
        )
        .filter(Boolean);
    } else if (trackIds.length) {
      for (const id of trackIds.slice(0, 40)) {
        try {
          const data = await deezer.searchTracks(`track:"${id}"`, 1);
          /* fallback: direct track endpoint */
        } catch {
          /* ignore */
        }
      }
    }

    /* Prefer explicit tracks from client (already from Deezer search). */
    if (!tracks.length && rawTracks.length === 0 && trackIds.length) {
      const axios = require("axios") as any;
      for (const id of trackIds.slice(0, 40)) {
        try {
          const r = await axios.get(`https://api.deezer.com/track/${encodeURIComponent(id)}`, { timeout: 10000 });
          const mapped = deezer.mapTrack(r?.data);
          if (mapped) tracks.push(mapped);
        } catch {
          /* skip */
        }
      }
    }

    if (tracks.length < 4) {
      return res.status(400).json({ ok: false, error: "not_enough_tracks", message: "Servono almeno 4 brani con anteprima." });
    }

    let base = slugify(title) || `quiz-${Date.now().toString(36)}`;
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
        tracks: tracks.slice(0, 40),
        plays: 0,
        ...settings,
      },
    });

    return res.json({ ok: true, pack: serializePack(pack.toObject ? pack.toObject() : pack) });
  } catch (err: any) {
    global.logger?.warn?.("[music-quiz] create pack:", err?.message || err);
    return res.status(500).json({ ok: false, error: "create_error" });
  }
}

export = { handleMusicQuizPackGet, handleMusicQuizPackCreatePost, serializePack };
