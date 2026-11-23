/** Music Quiz: commenti sul pack (membri del server). */
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

function mapComments(pack: any) {
  const comments = Array.isArray(pack?.comments) ? pack.comments : [];
  return comments
    .slice()
    .reverse()
    .slice(0, 80)
    .map((c: any) => ({
      id: String(c._id || ""),
      userId: c.userId,
      authorName: c.authorName || "Staff",
      authorAvatarUrl: c.authorAvatarUrl || "",
      content: c.content || "",
      createdAt: c.createdAt,
    }));
}

async function handleMusicQuizCommentsGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    const slug = String(req.query?.slug || req.params?.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });
    const pack = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
      boardSlug: slug,
    }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, comments: mapComments(pack) });
  } catch {
    return res.status(500).json({ ok: false, error: "comments_error" });
  }
}

async function handleMusicQuizCommentsPost(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth) || !auth.ok) return;
  try {
    const body = req.body || {};
    const slug = String(body.slug || req.params?.slug || "").trim();
    const content = String(body.content || "").trim().slice(0, 400);
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });
    if (content.length < 2) return res.status(400).json({ ok: false, error: "empty" });
    const pack = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
      boardSlug: slug,
    });
    if (!pack) return res.status(404).json({ ok: false, error: "not_found" });
    (pack as any).comments = (pack as any).comments || [];
    (pack as any).comments.push({
      userId: auth.userId,
      authorName: auth.displayName,
      authorAvatarUrl: auth.avatarUrl,
      content,
    });
    if ((pack as any).comments.length > 200) {
      (pack as any).comments = (pack as any).comments.slice(-200);
    }
    await pack.save();
    return res.json({ ok: true, comments: mapComments(pack.toObject ? pack.toObject() : pack) });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "comments_error" });
  }
}

export = { handleMusicQuizCommentsGet, handleMusicQuizCommentsPost };
