/** Music Quiz leaderboard per pack. */
const { requireMusicQuizHighStaff, musicQuizViewer, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

async function handleMusicQuizScoresGet(client?, req?, res?) {
  /* si gioca anche senza accesso (ospite) */
  const auth = await musicQuizViewer(client, req);
  try {
    const slug = String(req.query?.slug || req.params?.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });
    const difficulty = String(req.query?.difficulty || "").trim();
    const mode = String(req.query?.mode || "solo").trim() || "solo";
    const filter: any = {
      docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_SCORE,
      boardSlug: slug,
      "payload.mode": mode,
    };
    if (difficulty) filter["payload.difficulty"] = difficulty;
    const rows = await SiteDocument.find(filter).sort({ "payload.score": -1, updatedAt: 1 }).limit(50).lean();
    const scores = (rows || []).map((r: any, i: number) => ({
      rank: i + 1,
      userId: r.userId,
      displayName: r.authorName || "Staff",
      avatarUrl: r.authorAvatarUrl || "",
      score: Number(r.payload?.score || 0),
      maxScore: Number(r.payload?.maxScore || 1000),
      difficulty: r.payload?.difficulty || "5s",
      mode: r.payload?.mode || "solo",
      at: r.updatedAt || r.createdAt,
    }));
    return res.json({ ok: true, scores });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "scores_error" });
  }
}

export = { handleMusicQuizScoresGet };
