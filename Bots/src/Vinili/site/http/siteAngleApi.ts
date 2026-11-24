/**
 * Angolo: l'angolo del giorno (uguale per tutti), 4 tentativi.
 * Si gioca senza accesso; con l'accesso si salvano le statistiche; nel server Discord arriva l'EXP (una volta al giorno).
 * Il server ricalcola l'angolo del giorno con la stessa formula del sito e controlla i tentativi.
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const MAX_ATTEMPTS = 4;
/** vale come indovinato entro questi gradi */
const TOLERANCE = 2;

/** stesso calcolo di WebSite/src/lib/angle.ts: FNV-1a sul giorno → angolo tra 10° e 350° */
function dailyAngle(day: string) {
  let h = 0x811c9dc5;
  for (const ch of `${day}|vc-angolo`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 10 + (h % 341);
}

/** giorno di Roma, come sul sito */
function romeDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const mainGuildId = (client?: any) => String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();

function emptyStats() {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, lastDay: "", dist: { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<string, number> };
}

async function loadStats(client: any, userId: string) {
  const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const doc: any = await ActivityUserProfile.findOne({ guildId: mainGuildId(client), userId })
    .select("profile.angleStats profile.angleDays")
    .lean()
    .catch(() => null);
  return { stats: { ...emptyStats(), ...(doc?.profile?.angleStats || {}) }, days: doc?.profile?.angleDays || {} };
}

/** Fine dell'angolo del giorno. Body: { day, guesses: number[] } */
async function handleAngleResultPost(client?, req?, res?) {
  try {
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    const body = req.body || {};
    const day = String(body.day || "");
    /* solo il giorno di oggi (o ieri, per chi finisce a cavallo di mezzanotte) */
    const today = romeDay();
    const yesterday = romeDay(new Date(Date.now() - 86_400_000));
    if (day !== today && day !== yesterday) return res.status(400).json({ ok: false, error: "bad_day" });
    const guesses = (Array.isArray(body.guesses) ? body.guesses : []).slice(0, MAX_ATTEMPTS).map((g: unknown) => Math.round(Number(g)));
    if (!guesses.length || guesses.some((g: number) => !Number.isFinite(g) || g < 0 || g > 360)) {
      return res.status(400).json({ ok: false, error: "bad_guesses" });
    }
    const answer = dailyAngle(day);
    const hit = guesses.findIndex((g: number) => Math.abs(g - answer) <= TOLERANCE);
    const solved = hit >= 0;
    const attempts = solved ? hit + 1 : guesses.length;
    if (viewer.guest) return res.json({ ok: true, saved: false, solved, answer, reward: { auth: "guest", exp: 0 } });

    const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
    const guildId = mainGuildId(client);
    const userId = viewer.userId;
    await ActivityUserProfile.updateOne({ guildId, userId }, { $setOnInsert: { guildId, userId } }, { upsert: true }).catch(() => null);
    /* un risultato al giorno: chi lo ha già salvato non lo cambia */
    const claimed = await ActivityUserProfile.findOneAndUpdate(
      { guildId, userId, $or: [{ [`profile.angleDays.${day}`]: null }, { [`profile.angleDays.${day}`]: { $exists: false } }] },
      { $set: { [`profile.angleDays.${day}`]: { attempts, solved, at: new Date() } } },
      { new: true },
    ).catch(() => null);
    if (!claimed) {
      const { stats } = await loadStats(client, userId);
      return res.json({ ok: true, saved: false, already: true, solved, answer, stats, reward: { auth: viewer.inGuild ? "member" : "outsider", exp: 0 } });
    }

    const { stats } = await loadStats(client, userId);
    stats.played += 1;
    const continues = stats.lastDay === romeDay(new Date(new Date(`${day}T12:00:00Z`).getTime() - 86_400_000));
    if (solved) {
      stats.won += 1;
      stats.streak = continues ? stats.streak + 1 : 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[String(attempts)] = (Number(stats.dist[String(attempts)]) || 0) + 1;
    } else {
      stats.streak = 0;
    }
    stats.lastDay = day;
    await ActivityUserProfile.updateOne({ guildId, userId }, { $set: { "profile.angleStats": stats } }).catch(() => null);

    let reward: any = { auth: "outsider", exp: 0 };
    if (viewer.inGuild && solved) {
      const { claimQuizExp } = require("./siteQuizRewards") as typeof import("./siteQuizRewards");
      /* 1 tentativo = tutto, 4 tentativi = un quarto */
      reward = await claimQuizExp(client, viewer, { game: "angle", ratio: (MAX_ATTEMPTS + 1 - attempts) / MAX_ATTEMPTS, note: `Angolo ${day}` }).catch(() => ({ auth: "member", exp: 0 }));
    } else if (viewer.inGuild) reward = { auth: "member", exp: 0 };
    return res.json({ ok: true, saved: true, solved, answer, stats, reward });
  } catch (err: any) {
    global.logger?.warn?.("[angolo] risultato:", err?.message || err);
    return res.status(500).json({ ok: false, error: "angle_error" });
  }
}

/** Statistiche e partita di oggi di chi guarda (con l'accesso) */
async function handleAngleMeGet(client?, req?, res?) {
  try {
    const { musicQuizViewer } = require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
    const viewer = await musicQuizViewer(client, req);
    if (viewer.guest) return res.json({ ok: true, guest: true });
    const { stats, days } = await loadStats(client, viewer.userId);
    return res.json({ ok: true, guest: false, stats, today: days[romeDay()] || null });
  } catch {
    return res.status(500).json({ ok: false, error: "angle_me_error" });
  }
}

export = { handleAngleResultPost, handleAngleMeGet, dailyAngle };
