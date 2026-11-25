/**
 * EXP dei quiz del sito (Music Quiz e Number Quiz), come il Wordle:
 * solo con l'accesso e per chi è nel server Discord. Più è andata bene, più EXP;
 * c'è un tetto al giorno comune a tutti i quiz, così non si fa EXP all'infinito.
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { addExpWithLevel } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");

/** EXP massima al giorno da tutti i quiz insieme (≈ 20 minuti in vocale): i livelli non devono salire solo giocando */
const DAILY_CAP = 100;

const GAMES = {
  /* una partita del Music Quiz: da 5 a 25 EXP */
  music: { min: 5, max: 25, label: "Music Quiz" },
  /* una partita del Number Quiz: da 3 a 20 EXP */
  number: { min: 3, max: 20, label: "Number Quiz" },
  /* l'angolo del giorno: da 10 a 40 EXP, una volta al giorno */
  angle: { min: 10, max: 40, label: "Angle" },
} as const;

type QuizReward = { auth: "guest" | "outsider" | "member"; exp: number; capped?: boolean; todayExp?: number; cap?: number };

function today() {
  return new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
}

/** ratio: da 0 (male) a 1 (perfetto) */
async function claimQuizExp(
  client: any,
  viewer: { userId: string; member?: any; inGuild: boolean },
  opts: { game: keyof typeof GAMES; ratio: number; note?: string },
): Promise<QuizReward> {
  if (!viewer?.inGuild || !viewer.userId) return { auth: viewer?.userId ? "outsider" : "guest", exp: 0 };
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = viewer.member?.guild || client?.guilds?.cache?.get(guildId);
  if (!guild) return { auth: "member", exp: 0 };
  const g = GAMES[opts.game];
  const ratio = Math.max(0, Math.min(1, Number(opts.ratio) || 0));
  const want = Math.round(g.min + (g.max - g.min) * ratio);
  if (want <= 0) return { auth: "member", exp: 0 };

  const day = today();
  const path = `profile.siteQuizExp.${day}`;
  await ActivityUserProfile.updateOne({ guildId: guild.id, userId: viewer.userId }, { $setOnInsert: { guildId: guild.id, userId: viewer.userId } }, { upsert: true }).catch(() => null);
  const doc: any = await ActivityUserProfile.findOne({ guildId: guild.id, userId: viewer.userId }).select(path).lean().catch(() => null);
  const used = Number(doc?.profile?.siteQuizExp?.[day]?.exp || 0);
  const grant = Math.max(0, Math.min(want, DAILY_CAP - used));
  if (!grant) return { auth: "member", exp: 0, capped: true, todayExp: used, cap: DAILY_CAP };

  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId: viewer.userId },
    { $inc: { [`${path}.exp`]: grant, [`${path}.games`]: 1 } },
  ).catch(() => null);
  await addExpWithLevel(guild, viewer.userId, grant, false, true, {
    source: `site_${opts.game}_quiz`,
    note: opts.note || g.label,
  }).catch(() => null);
  return { auth: "member", exp: grant, capped: grant < want, todayExp: used + grant, cap: DAILY_CAP };
}

export = { claimQuizExp, DAILY_CAP };
