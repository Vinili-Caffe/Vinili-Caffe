/**
 * Bump e voti per tutti i server (anche il principale: lì, per i servizi accesi qui, si ferma il sistema classico con EXP).
 * - bump: riconosce Disboard/Discadia, ringrazia, ruolo a tempo, promemoria quando si può ribumpare
 * - voti: webhook Top.gg/Discadia per server (URL con token), ringraziamento e ruolo a tempo
 * - classifica: conteggio bump e voti per utente
 * Impostazioni e stato in BotState (tenantCommunityTools: bumpVotes / bumpVotesState).
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const crypto = require("crypto") as typeof import("crypto");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

type Service = "disboard" | "discadia";
const SERVICES: Service[] = ["disboard", "discadia"];
const SERVICE_LABEL: Record<Service, string> = { disboard: "Disboard", discadia: "Discadia" };
const BOT_IDS: Record<Service, string> = { disboard: "302050872383242240", discadia: "1222548162741538938" };
const DEFAULT_COOLDOWN_MIN: Record<Service, number> = { disboard: 120, discadia: 1440 };

const restOf = (client?) => client?.rest || client?._rest || null;
const textDraft = (content: string) => T.normalizeDraft({ content, embed: { enabled: false }, buttons: [] });

/* ───────────── impostazioni ───────────── */

function normalizeReward(r?) {
  const hours = Math.floor(Number(r?.hours));
  return { roleId: T.isId(r?.roleId) ? String(r.roleId) : null, hours: Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 12 };
}

type VoteService = "topgg" | "discadia";
const VOTE_SERVICES: VoteService[] = ["topgg", "discadia"];
const VOTE_LABEL: Record<VoteService, string> = { topgg: "Top.gg", discadia: "Discadia" };
const DEFAULT_VOTE_HOURS: Record<VoteService, number> = { topgg: 12, discadia: 24 };
const DEFAULT_BUMP_THANKS = "{user} grazie per il bump su **{service}**! 💙 Hai fatto {count} bump.";
const DEFAULT_REMINDER = "{role} si può di nuovo bumpare su **{service}**! Usa il comando `/bump`.";
const DEFAULT_VOTE_THANKS = "{user} grazie per il voto su **{service}**! ⭐ Voti totali: {count}.";

const hoursOr = (v?, fb = 12) => {
  const h = Math.floor(Number(v));
  return Number.isFinite(h) && h >= 1 && h <= 720 ? h : fb;
};

/* EXP (solo server principale, dove ci sono i livelli): stessi calcoli del sistema classico */
type ExpKey = "disboard" | "discadia" | "topgg" | "discadiaVote";
const EXP_KEYS: ExpKey[] = ["disboard", "discadia", "topgg", "discadiaVote"];
const EXP_DEFAULTS: Record<ExpKey, any> = {
  disboard: { enabled: true, minExp: 100, maxExp: 100, firstTimeExp: 0, fastWindowMinutes: 5, fastMultiplier: 1.5, streakPercent: 10, streakMaxPercent: 50 },
  discadia: { enabled: false, minExp: 100, maxExp: 100, firstTimeExp: 0, fastWindowMinutes: 5, fastMultiplier: 1.5, streakPercent: 10, streakMaxPercent: 50 },
  topgg: { enabled: true, minExp: 100, maxExp: 250, firstTimeExp: 250, fastWindowMinutes: 15, fastMultiplier: 1.5, streakPercent: 10, streakMaxPercent: 50 },
  discadiaVote: { enabled: true, minExp: 100, maxExp: 250, firstTimeExp: 250, fastWindowMinutes: 15, fastMultiplier: 1.5, streakPercent: 10, streakMaxPercent: 50 },
};
function numIn(v?, min = 0, max = 100000, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fb;
}
function normalizeExp(raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    EXP_KEYS.map((k) => {
      const x = r[k] && typeof r[k] === "object" ? r[k] : {};
      const d = EXP_DEFAULTS[k];
      const minExp = Math.round(numIn(x.minExp, 0, 100000, d.minExp));
      return [
        k,
        {
          enabled: typeof x.enabled === "boolean" ? x.enabled : d.enabled,
          minExp,
          maxExp: Math.max(minExp, Math.round(numIn(x.maxExp, 0, 100000, d.maxExp))),
          firstTimeExp: Math.round(numIn(x.firstTimeExp, 0, 100000, d.firstTimeExp)),
          fastWindowMinutes: Math.round(numIn(x.fastWindowMinutes, 0, 1440, d.fastWindowMinutes)),
          fastMultiplier: numIn(x.fastMultiplier, 1, 10, d.fastMultiplier),
          streakPercent: Math.round(numIn(x.streakPercent, 0, 1000, d.streakPercent)),
          streakMaxPercent: Math.round(numIn(x.streakMaxPercent, 0, 10000, d.streakMaxPercent)),
        },
      ];
    }),
  ) as Record<ExpKey, typeof EXP_DEFAULTS.disboard>;
}

/* ogni servizio ha i suoi testi (e le sue ore per i voti); i vecchi testi unici fanno da base */
function normalizeConfig(raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  const svc = r.services && typeof r.services === "object" ? r.services : {};
  const th = r.thanks && typeof r.thanks === "object" ? r.thanks : {};
  const rem = r.reminder && typeof r.reminder === "object" ? r.reminder : {};
  const v = r.votes && typeof r.votes === "object" ? r.votes : {};
  const vth = v.thanks && typeof v.thanks === "object" ? v.thanks : {};
  const vps = v.perService && typeof v.perService === "object" ? v.perService : {};
  const draftOr = (d?, fallback?, text = "") => (d ? T.normalizeDraft(d) : fallback ? T.normalizeDraft(fallback) : textDraft(text));
  const services = Object.fromEntries(
    SERVICES.map((s) => {
      const x = svc[s] && typeof svc[s] === "object" ? svc[s] : {};
      const cd = Math.floor(Number(x.cooldownMinutes));
      return [
        s,
        {
          enabled: x.enabled !== false,
          cooldownMinutes: Number.isFinite(cd) && cd >= 5 && cd <= 10080 ? cd : DEFAULT_COOLDOWN_MIN[s],
          thanksDraft: draftOr(x.thanksDraft, th.draft, DEFAULT_BUMP_THANKS),
          reminderDraft: draftOr(x.reminderDraft, rem.draft, DEFAULT_REMINDER),
        },
      ];
    }),
  ) as Record<Service, { enabled: boolean; cooldownMinutes: number; thanksDraft: any; reminderDraft: any }>;
  const perService = Object.fromEntries(
    VOTE_SERVICES.map((s) => {
      const x = vps[s] && typeof vps[s] === "object" ? vps[s] : {};
      return [
        s,
        {
          draft: draftOr(x.draft, vth.draft, DEFAULT_VOTE_THANKS),
          hours: hoursOr(x.hours, v.reward?.hours ? hoursOr(v.reward.hours) : DEFAULT_VOTE_HOURS[s]),
          reminderDraft: draftOr(x.reminderDraft, null, ""),
          reminderEnabled: x.reminderEnabled !== false,
        },
      ];
    }),
  ) as Record<VoteService, { draft: any; hours: number; reminderDraft: any; reminderEnabled: boolean }>;
  return {
    enabled: r.enabled === true,
    services,
    thanks: { enabled: th.enabled !== false },
    reminder: {
      enabled: rem.enabled !== false,
      channelId: T.isId(rem.channelId) ? String(rem.channelId) : null,
      roleId: T.isId(rem.roleId) ? String(rem.roleId) : null,
    },
    reward: normalizeReward(r.reward),
    votes: {
      enabled: v.enabled === true,
      token: typeof v.token === "string" && /^[a-f0-9]{32}$/.test(v.token) ? v.token : crypto.randomBytes(16).toString("hex"),
      topgg: v.topgg !== false,
      discadia: v.discadia !== false,
      channelId: T.isId(v.channelId) ? String(v.channelId) : null,
      thanks: { enabled: vth.enabled !== false },
      rewardRoleId: T.isId(v.rewardRoleId ?? v.reward?.roleId) ? String(v.rewardRoleId ?? v.reward?.roleId) : null,
      perService,
    },
    exp: normalizeExp(r.exp),
    /* import dal sistema del server principale */
    seedVersion: Number.isInteger(r.seedVersion) ? r.seedVersion : 0,
    userSaved: r.userSaved === true,
  };
}
type BumpConfig = ReturnType<typeof normalizeConfig>;

async function getConfig(guildId: string, fresh = false): Promise<BumpConfig> {
  return normalizeConfig(await T.getGuildBlob("bumpVotes", guildId, fresh));
}

/** Merge parziale: i pannelli Bump e Voti possono salvare solo la propria metà. */
async function saveConfig(guildId: string, raw?) {
  const prev = await getConfig(guildId, true);
  const r = raw && typeof raw === "object" ? raw : {};
  const nextRaw: any = {
    enabled: "enabled" in r ? r.enabled : prev.enabled,
    services: { ...prev.services },
    thanks: { ...prev.thanks, ...(r.thanks && typeof r.thanks === "object" ? r.thanks : {}) },
    reminder: { ...prev.reminder, ...(r.reminder && typeof r.reminder === "object" ? r.reminder : {}) },
    reward: { ...prev.reward, ...(r.reward && typeof r.reward === "object" ? r.reward : {}) },
    votes: {
      ...prev.votes,
      ...(r.votes && typeof r.votes === "object" ? r.votes : {}),
      token: prev.votes.token,
      thanks: {
        ...prev.votes.thanks,
        ...(r.votes?.thanks && typeof r.votes.thanks === "object" ? r.votes.thanks : {}),
      },
      perService: { ...prev.votes.perService },
    },
    exp: { ...prev.exp },
    seedVersion: prev.seedVersion,
    userSaved: true,
  };
  if (r.services && typeof r.services === "object") {
    for (const s of SERVICES) {
      if (r.services[s] && typeof r.services[s] === "object") {
        nextRaw.services[s] = { ...prev.services[s], ...r.services[s] };
      }
    }
  }
  if (r.votes?.perService && typeof r.votes.perService === "object") {
    for (const s of VOTE_SERVICES) {
      if (r.votes.perService[s] && typeof r.votes.perService[s] === "object") {
        nextRaw.votes.perService[s] = { ...prev.votes.perService[s], ...r.votes.perService[s] };
      }
    }
  }
  if (r.exp && typeof r.exp === "object") {
    for (const k of EXP_KEYS) {
      if (r.exp[k] && typeof r.exp[k] === "object") {
        nextRaw.exp[k] = { ...prev.exp[k], ...r.exp[k] };
      }
    }
  }
  const next = normalizeConfig(nextRaw);
  await T.setGuildBlob("bumpVotes", guildId, next);
  return next;
}

async function regenerateToken(guildId: string) {
  const cfg = await getConfig(guildId, true);
  cfg.votes.token = crypto.randomBytes(16).toString("hex");
  await T.setGuildBlob("bumpVotes", guildId, cfg);
  return cfg;
}

/* ───────────── stato (ultimo bump, conteggi, ruoli a tempo) ───────────── */

type LastBump = { at: number; userId: string | null; channelId: string; messageId: string; remindAt: number; reminded: boolean };
type State = {
  last: Partial<Record<Service, LastBump>>;
  bumps: Record<string, number>;
  votes: Record<string, number>;
  voteLast: Partial<Record<"topgg" | "discadia", Record<string, number>>>;
  roleExpiry: { userId: string; roleId: string; until: number }[];
};

async function getState(guildId: string): Promise<State> {
  const s = (await T.getGuildBlob("bumpVotesState", guildId, true)) || {};
  return {
    last: s.last && typeof s.last === "object" ? s.last : {},
    bumps: s.bumps && typeof s.bumps === "object" ? s.bumps : {},
    votes: s.votes && typeof s.votes === "object" ? s.votes : {},
    voteLast: s.voteLast && typeof s.voteLast === "object" ? s.voteLast : {},
    roleExpiry: Array.isArray(s.roleExpiry) ? s.roleExpiry.slice(-500) : [],
  };
}

const saveState = (guildId: string, st: State) => T.setGuildBlob("bumpVotesState", guildId, st);

/* ───────────── invio messaggi e ruoli ───────────── */

async function sendDraft(client?, channelId?: string | null, draft?, vars: Record<string, string> = {}, mentionUserId: string | null = null, roleId: string | null = null) {
  const rest = restOf(client);
  if (!rest || !channelId || !draft || T.draftIsEmpty(draft)) return false;
  const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId });
  if (roleId) body.allowed_mentions = { ...(body.allowed_mentions || { parse: [] }), roles: [...new Set([...(body.allowed_mentions?.roles || []), roleId])] };
  return rest
    .post(Routes.channelMessages(channelId), { body })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[BUMP VOTES] invio non riuscito:", channelId, err?.rawError?.message || err?.message || err);
      return false;
    });
}

async function giveTimedRole(client?, guildId?: string, userId?: string | null, reward?: { roleId: string | null; hours: number }, st?: State) {
  const rest = restOf(client);
  if (!rest || !userId || !reward?.roleId || !st) return;
  const ok = await rest
    .put(Routes.guildMemberRole(String(guildId), userId, reward.roleId), { reason: "Ricompensa bump/voto" })
    .then(() => true)
    .catch(() => false);
  if (!ok) return;
  const until = Date.now() + reward.hours * 3_600_000;
  st.roleExpiry = st.roleExpiry.filter((x) => !(x.userId === userId && x.roleId === reward.roleId));
  st.roleExpiry.push({ userId, roleId: reward.roleId, until });
}

async function userVars(client?, guild?, userId?: string | null) {
  const uid = String(userId || "").trim();
  let user = null;
  if (uid && guild?.members?.fetch) {
    const member = await guild.members.fetch(uid).catch(() => null);
    user = member?.user || null;
  }
  if (!user && uid && client?.users?.fetch) {
    user = await client.users.fetch(uid).catch(() => null);
  }
  if (user || guild) {
    return T.memberVars(guild || null, user || (uid ? { id: uid } : null), {});
  }
  return {
    user: uid ? `<@${uid}>` : "Qualcuno",
    "user.id": uid || "",
    server: "",
    avatar: "",
    username: "",
    "user.name": "",
    servericon: "",
    serverbanner: "",
  };
}

/* ───────────── EXP (solo server principale) ───────────── */

const EXP_SOURCE: Record<ExpKey, string> = { disboard: "disboard", discadia: "discadia_bump_module", topgg: "discadia_vote", discadiaVote: "discadia_vote" };
const NO_EXP = { exp: "0", fast: "0", streak: "0", bonus: "" };

async function giveExp(client?, guild?, userId?: string | null, key?: ExpKey, cfg?: BumpConfig, ctx: { previousLastAt?: number | null; cooldownMs?: number; fastSinceAt?: number | null; previousUserId?: string | null; firstTime?: boolean } = {}) {
  if (!guild?.id || !userId || !key || !cfg || !T.isMainGuild(String(guild.id))) return NO_EXP;
  const x = cfg.exp[key];
  if (!x?.enabled) return NO_EXP;
  const step = 5;
  const span = Math.max(0, Math.floor((x.maxExp - x.minExp) / step));
  const base = ctx.firstTime && x.firstTimeExp > 0 ? x.firstTimeExp : x.minExp + Math.floor(Math.random() * (span + 1)) * step;
  if (base <= 0) return NO_EXP;
  try {
    const { awardBumpVoteExp } = require("../../Vinili/Community/services/bumpRewards") as typeof import("../../Vinili/Community/services/bumpRewards");
    const reward: any = await awardBumpVoteExp(
      client,
      guild,
      userId,
      EXP_SOURCE[key],
      ctx.previousLastAt ? new Date(ctx.previousLastAt) : null,
      ctx.cooldownMs || 0,
      base,
      ctx.fastSinceAt ? new Date(ctx.fastSinceAt) : null,
      ctx.previousUserId || null,
      {
        baseExp: base,
        fastGuess: { windowMs: x.fastWindowMinutes * 60_000, multiplier: x.fastMultiplier },
        streak: { bonusPercentPerWin: x.streakPercent, maxBonusPercent: x.streakMaxPercent },
      },
    );
    if (!reward || reward.effectiveExp == null) return NO_EXP;
    const { E } = require("../../shared/emojis/emojiCatalog") as any;
    const flame = String(E?.VC_Flame || "🔥");
    const lines: string[] = [];
    if (reward.fastBonus > 0) lines.push(`${flame} Risposta rapida **+${reward.fastBonus} exp**`);
    if (reward.streakBonus > 0) lines.push(`${flame} Streak ${reward.newStreak} **+${reward.streakBonus} exp**`);
    /* senza \n iniziale: nei draft dashboard {bonus} è su riga sua (fill toglie la riga se vuoto) */
    return { exp: String(reward.effectiveExp), fast: String(reward.fastBonus || 0), streak: String(reward.newStreak || 1), bonus: lines.join("\n") };
  } catch (err) {
    global.logger?.warn?.("[BUMP VOTES] exp:", (err as any)?.message || err);
    return NO_EXP;
  }
}

/* ───────────── riconoscimento bump ───────────── */

const DISBOARD_OK = ["bump done", "bump successful", "has been bumped", "successfully bumped", "was bumped", "server bumped", "bump effettuato"];
const DISCADIA_OK = ["has been successfully bumped", "successfully bumped", "bumped successfully", "boost earned", "bump done", "thanks for bumping"];

function messageText(message?) {
  /* contenuto, embed e messaggi a blocchi (Components V2: Discadia ora risponde così) */
  const { messageTextParts } = require("../../shared/discord/messageText") as typeof import("../../shared/discord/messageText");
  return messageTextParts(message).join("\n").toLowerCase().replace(/\s+/g, " ");
}

function detectBump(message?): Service | null {
  const author = String(message?.author?.id || "");
  const text = messageText(message);
  if (!text) return null;
  if (author === BOT_IDS.disboard && DISBOARD_OK.some((p) => text.includes(p))) return "disboard";
  if (author === BOT_IDS.discadia && !/already bumped/.test(text) && (DISCADIA_OK.some((p) => text.includes(p)) || (/\bbumped\b/.test(text) && /boosts? earned/.test(text)))) return "discadia";
  return null;
}

/** Chiamato su ogni messaggio dei server tenant. */
async function handleTenantBumpMessage(message?, opts: { recheck?: boolean } = {}) {
  const guildId = String(message?.guild?.id || "");
  if (!guildId || !message?.author?.bot) return false;
  if (!(require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(guildId, "bump")) return false;
  const service = detectBump(message);
  if (!service) {
    /* bot del bump senza testo ancora (risposta in arrivo): riprova sul messaggio aggiornato */
    const author = String(message?.author?.id || "");
    if (!opts.recheck && (author === BOT_IDS.disboard || author === BOT_IDS.discadia) && !messageText(message)) {
      for (const delay of [2500, 7000]) {
        setTimeout(() => {
          void (async () => {
            const fresh = await message.channel?.messages?.fetch?.(message.id).catch(() => null);
            if (fresh) await handleTenantBumpMessage(fresh, { recheck: true }).catch(() => null);
          })();
        }, delay).unref?.();
      }
    }
    return false;
  }
  const cfg = await getConfig(guildId);
  if (!cfg.enabled || !cfg.services[service].enabled) return false;
  const st = await getState(guildId);
  if (st.last[service]?.messageId === String(message.id)) return true;
  const userId = String(message.interactionMetadata?.user?.id || message.interaction?.user?.id || "") || null;
  const now = Date.now();
  const prev = st.last[service];
  const expOut = await giveExp(message.client, message.guild, userId, service, cfg, {
    previousLastAt: prev?.at || null,
    cooldownMs: cfg.services[service].cooldownMinutes * 60_000,
    /* "risposta rapida": bump entro poco dal promemoria */
    fastSinceAt: prev?.reminded ? prev.remindAt : null,
    previousUserId: prev?.userId || null,
  });
  st.last[service] = {
    at: now,
    userId,
    channelId: String(message.channelId),
    messageId: String(message.id),
    remindAt: now + cfg.services[service].cooldownMinutes * 60_000,
    reminded: false,
  };
  if (userId) st.bumps[userId] = (st.bumps[userId] || 0) + 1;
  await giveTimedRole(message.client, guildId, userId, cfg.reward, st);
  await saveState(guildId, st);
  if (cfg.thanks.enabled) {
    await sendDraft(message.client, String(message.channelId), cfg.services[service].thanksDraft, { ...(await userVars(message.client, message.guild, userId)), ...expOut, service: SERVICE_LABEL[service], count: String(userId ? st.bumps[userId] : 0) }, userId);
  }
  return true;
}

/* ───────────── voti (webhook) ───────────── */

async function resolveGuild(client?, gid?: string) {
  const cached = client?.guilds?.cache?.get?.(String(gid));
  if (cached) return cached;
  try {
    return (await client?.guilds?.fetch?.(String(gid))) || null;
  } catch {
    return null;
  }
}

async function handleVoteWebhook(client?, guildId?: string, service?: string, token?: string, body?) {
  const gid = String(guildId || "");
  if (!T.isId(gid) || (service !== "topgg" && service !== "discadia")) return { status: 404, text: "Not found" };
  if (!(require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(gid, "voti")) return { status: 200, text: "Disabled" };
  const cfg = await getConfig(gid, true);
  if (!cfg.votes.enabled || token !== cfg.votes.token) return { status: 401, text: "Unauthorized" };
  if (!cfg.votes[service]) return { status: 200, text: "Disabled" };
  const type = String(body?.type || "").toLowerCase();
  if (type === "test" || type === "webhook.test") return { status: 200, text: "OK" };
  let userId: string | null = null;
  try {
    const { extractVoteWebhookUserId } = require("../../Vinili/site/http/discadiaVoteWebhook") as typeof import("../../Vinili/site/http/discadiaVoteWebhook");
    const { extractTopggVoteDiscordUserId } = require("../../Vinili/site/http/topggVoteWebhook") as typeof import("../../Vinili/site/http/topggVoteWebhook");
    userId = String((service === "topgg" ? extractTopggVoteDiscordUserId(body) : extractVoteWebhookUserId(body)) || "") || null;
  } catch (_) {}
  if (!userId || !T.isId(userId)) return { status: 400, text: "User ID missing" };
  const st = await getState(gid);
  const firstTime = !st.votes[userId];
  const lastMap = (st.voteLast[service] = st.voteLast[service] || {});
  const guild = await resolveGuild(client, gid);
  const expOut = await giveExp(client, guild, userId, service === "topgg" ? "topgg" : "discadiaVote", cfg, {
    previousLastAt: lastMap[userId] || null,
    cooldownMs: cfg.votes.perService[service].hours * 3_600_000,
    firstTime,
  });
  lastMap[userId] = Date.now();
  st.votes[userId] = (st.votes[userId] || 0) + 1;
  await giveTimedRole(client, gid, userId, { roleId: cfg.votes.rewardRoleId, hours: cfg.votes.perService[service].hours }, st);
  await saveState(gid, st);
  if (cfg.votes.thanks.enabled && cfg.votes.channelId) {
    const label = VOTE_LABEL[service];
    await sendDraft(client, cfg.votes.channelId, cfg.votes.perService[service].draft, { ...(await userVars(client, guild, userId)), ...expOut, service: label, count: String(st.votes[userId]) }, userId);
  }
  return { status: 200, text: "OK" };
}

/**
 * Ringraziamento voto del percorso classico MAIN: usa i draft della dashboard
 * (Bump e voti → Voti), anche se il modulo webhook voti non è ancora acceso.
 */
async function trySendConfiguredVoteThanks(
  client?,
  guild?,
  userId?: string | null,
  voteListing?: string,
  vars: Record<string, string> = {},
  fallbackChannelId?: string | null,
) {
  const gid = String(guild?.id || "");
  const service: VoteService | null = voteListing === "topgg" ? "topgg" : voteListing === "discadia" ? "discadia" : null;
  if (!client || !gid || !service || !userId) return false;
  try {
    const raw = await T.getGuildBlob("bumpVotes", gid, true);
    if (!raw || typeof raw !== "object") return false;
    const cfg = normalizeConfig(raw);
    /* Solo draft davvero configurati (dashboard o seed main), non il default vuoto. */
    if (!cfg.userSaved && !(T.isMainGuild(gid) && Number(cfg.seedVersion) >= 1)) return false;
    if (!cfg.votes.thanks.enabled) return false;
    if (service === "topgg" && cfg.votes.topgg === false) return false;
    if (service === "discadia" && cfg.votes.discadia === false) return false;
    const draft = cfg.votes.perService[service]?.draft;
    if (T.draftIsEmpty(draft)) return false;
    const channelId = cfg.votes.channelId || (T.isId(fallbackChannelId) ? String(fallbackChannelId) : null);
    if (!channelId) return false;
    const label = VOTE_LABEL[service];
    return await sendDraft(
      client,
      channelId,
      draft,
      {
        ...(await userVars(client, guild, userId)),
        service: label,
        ...vars,
      },
      userId,
    );
  } catch (err) {
    global.logger?.warn?.("[BUMP VOTES] classic vote draft:", (err as any)?.message || err);
    return false;
  }
}

/* ───────────── scheduler: promemoria e ruoli scaduti ───────────── */

async function runBumpVotesTick(client?) {
  const rest = restOf(client);
  if (!rest) return;
  const all = await T.allGuildBlobs("bumpVotesState");
  const now = Date.now();
  for (const gid of Object.keys(all)) {
    const raw = all[gid];
    const due = SERVICES.some((s) => raw?.last?.[s] && !raw.last[s].reminded && raw.last[s].remindAt <= now);
    const expired = Array.isArray(raw?.roleExpiry) && raw.roleExpiry.some((x?) => x.until <= now);
    if (!due && !expired) continue;
    const cfg = await getConfig(gid);
    const st = await getState(gid);
    for (const s of SERVICES) {
      const last = st.last[s];
      if (!last || last.reminded || last.remindAt > now) continue;
      last.reminded = true;
      if (cfg.enabled && cfg.services[s].enabled && cfg.reminder.enabled) {
        const roleId = cfg.reminder.roleId;
        await sendDraft(client, cfg.reminder.channelId || last.channelId, cfg.services[s].reminderDraft, { role: roleId ? `<@&${roleId}>` : "", service: SERVICE_LABEL[s], server: "" }, null, roleId);
      }
    }
    const keep: State["roleExpiry"] = [];
    for (const x of st.roleExpiry) {
      if (x.until > now) {
        keep.push(x);
        continue;
      }
      await rest.delete(Routes.guildMemberRole(gid, x.userId, x.roleId), { reason: "Ricompensa bump/voto scaduta" }).catch(() => null);
    }
    st.roleExpiry = keep;
    await saveState(gid, st);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
function startBumpVotesLoop(client?) {
  if (timer) return;
  const tick = () =>
    void runBumpVotesTick(client).catch((err?) => global.logger?.warn?.("[BUMP VOTES] tick:", err?.message || err));
  timer = setInterval(tick, 60_000);
  timer.unref?.();
  setTimeout(tick, 20_000).unref?.();
}

/**
 * Server principale: le impostazioni di adesso (attese, ringraziamento, promemoria, voti, ruolo Voter)
 * portate nel modulo, spente: si accende quando si vuole passare al modulo.
 */
const MAIN_SEED_VERSION = 7;
function linesToText(raw?) {
  if (Array.isArray(raw) && raw.length) return raw.map((x) => String(x || "")).join("\n");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}
function mainSeedConfig(client?) {
  const IDs = require("../../Vinili/Config/ids") as any;
  const { E } = require("../../shared/emojis/emojiCatalog") as any;
  const e = (k: string) => String(E?.[k] || "");
  const cfgMain = client?.config || {};
  const voterRole = String(IDs?.roles?.Voter || "") || null;
  const voteUrl = String(cfgMain?.topgg?.votePageUrl || cfgMain?.discadiaVoteReminder?.voteUrl || IDs?.links?.vote || "https://www.viniliecaffe.it/vote");
  const hours: Record<VoteService, number> = {
    topgg: Math.max(1, Math.round(Number(cfgMain?.topgg?.voteReminderCooldownHours) || 12)),
    discadia: Math.max(1, Math.round(Number(cfgMain?.discadiaVoteReminder?.cooldownHours) || 24)),
  };
  /* {bonus} su riga sua: fill() la toglie se non ci sono rapida/streak. */
  const bumpThanks = (again: string, withExp: boolean) => ({
    content: [
      `${e("VC_ThankYou")} **__Grazie {user} per aver \`bumpato\` il server!__**`,
      ...(withExp ? [`${e("VC_EXP")} **{exp} exp** guadagnati!`, "{bonus}"] : []),
      `${e("VC_HelloKittyGun")} Ci __vediamo__ nuovamente tra **${again}!**`,
    ].join("\n"),
    embed: { enabled: false },
    buttons: [],
  });
  const reminder = (title: string, url: string) => ({
    content: "{role}",
    embed: { enabled: true, title, url, description: `${e("VC_bump")} **Per bumpare scrivi __\`/bump\` in chat__**!`, color: "#6f4e37" },
    buttons: [],
  });
  const voteThanks = (s: VoteService) => {
    const h = hours[s];
    const label = h === 1 ? "1 ora" : `${h} ore`;
    return {
      content: "{user}",
      embed: {
        enabled: true,
        title: `${e("VC_Vote")} **Un nuovo voto!**`,
        description: [
          `${e("VC_ThankYou")} Grazie {user} per aver votato su **${VOTE_LABEL[s]}**!`,
          "",
          "`Hai guadagnato:`",
          `${e("VC_EXP")} ${e("VC_Arrow")} **{exp} EXP** per il tuo **{count}° voto** su **${VOTE_LABEL[s]}**`,
          "{bonus}",
          `${e("VC_Money")} ${e("VC_Arrow")} ${voterRole ? `Il ruolo <@&${voterRole}> per ${label}` : `Ricompensa per ${label}`}`,
          "",
          `${e("VC_update")} Vota di nuovo tra __${label}__ per ottenere **altri exp** dal **bottone sottostante**.`,
        ].join("\n"),
        color: "#6f4e37",
        thumbnailUrl: "{avatar}",
      },
      buttons: [{ label: "Vota cliccando qui", url: voteUrl, emoji: e("VC_HeartPink"), row: 0 }],
    };
  };
  const voteDmReminder = (s: VoteService) => {
    const h = hours[s];
    const classic =
      s === "topgg"
        ? linesToText(cfgMain?.topgg?.reminderMessage) ||
          [`${e("VC_topgg")} Hey! Sono passate ${h} ore: puoi votare di nuovo su **Top.gg**.`, `${e("VC_ThankYou")} **Grazie per il supporto!**`, `${e("link")} Per votare su Top.gg, clicca sul pulsante sottostante:\n`].join("\n")
        : linesToText(cfgMain?.discadiaVoteReminder?.message) ||
          [`${e("discadia") || e("VC_Discadia")} Hey! Sono passate ${h} ore: puoi votare di nuovo su Discadia.`, `${e("VC_ThankYou")} **Grazie per il supporto!**`, `${e("link")} Per votare su Discadia, clicca sul pulsante sottostante:\n`].join("\n");
    const url =
      s === "topgg"
        ? String(cfgMain?.topgg?.votePageUrl || voteUrl)
        : String(cfgMain?.discadiaVoteReminder?.voteUrl || voteUrl);
    return {
      content: "",
      embed: {
        enabled: true,
        title: "",
        description: classic,
        color: "#6f4e37",
        footerText: "DM voti: Personalizza → Privacy (Discadia e Top.gg separati) o Notifiche DM.",
      },
      buttons: url ? [{ label: "Vota cliccando qui", url, emoji: e("VC_HeartPink"), row: 0 }] : [],
    };
  };
  return normalizeConfig({
    enabled: false,
    services: {
      disboard: {
        enabled: true,
        cooldownMinutes: Number(cfgMain?.disboard?.cooldownMinutes) || 120,
        thanksDraft: bumpThanks("due ore", true),
        reminderDraft: reminder(`${e("VC_Eye")} **È L'ORA DEL \`BUMP\`!**`, "https://disboard.org/it/server/1329080093599076474"),
      },
      discadia: {
        enabled: true,
        cooldownMinutes: Number(cfgMain?.discadia?.cooldownMinutes) || 1440,
        thanksDraft: bumpThanks("24 ore", false),
        reminderDraft: reminder(`${e("VC_Eye")} **È L'ORA DEL \`BUMP\` SU DISCADIA!**`, "https://discadia.com/server/viniliecaffe/"),
      },
    },
    thanks: { enabled: true },
    reminder: { enabled: true, channelId: String(cfgMain?.disboard?.reminderChannelId || IDs?.channels?.commands || "") || null, roleId: "1544830661637046303" },
    reward: { roleId: null, hours: 12 },
    votes: {
      enabled: false,
      topgg: true,
      discadia: true,
      channelId: String(IDs?.channels?.supporters || "") || null,
      thanks: { enabled: true },
      rewardRoleId: voterRole,
      perService: {
        topgg: { draft: voteThanks("topgg"), hours: hours.topgg, reminderDraft: voteDmReminder("topgg"), reminderEnabled: true },
        discadia: { draft: voteThanks("discadia"), hours: hours.discadia, reminderDraft: voteDmReminder("discadia"), reminderEnabled: true },
      },
    },
    exp: {
      disboard: {
        enabled: true,
        minExp: Number(cfgMain?.disboard?.reward?.baseExp) || 100,
        maxExp: Number(cfgMain?.disboard?.reward?.baseExp) || 100,
        fastWindowMinutes: Math.round((Number(cfgMain?.disboard?.reward?.fastGuess?.windowMs) || 300000) / 60000),
        fastMultiplier: Number(cfgMain?.disboard?.reward?.fastGuess?.multiplier) || 1.5,
        streakPercent: Number(cfgMain?.disboard?.reward?.streak?.bonusPercentPerWin) || 10,
        streakMaxPercent: Number(cfgMain?.disboard?.reward?.streak?.maxBonusPercent) || 50,
      },
      discadia: { enabled: false },
      topgg: { enabled: true },
      discadiaVote: {
        enabled: true,
        fastWindowMinutes: Math.round((Number(cfgMain?.discadiaVoteReminder?.reward?.fastGuess?.windowMs) || 900000) / 60000),
        fastMultiplier: Number(cfgMain?.discadiaVoteReminder?.reward?.fastGuess?.multiplier) || 1.5,
      },
    },
    seedVersion: MAIN_SEED_VERSION,
  });
}

/** Prima apertura / soft-upgrade sul principale: importa le impostazioni attuali. */
async function ensureMainSeed(client?, guildId?: string) {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("bumpVotes", gid, true);
  const prevVersion = Number(prev?.seedVersion || 0);
  /* già salvato dall'utente: solo soft-fill dei reminder DM mancanti se seed vecchio */
  if (prev && prev.userSaved === true) {
    if (prevVersion >= MAIN_SEED_VERSION) return false;
    const seed = mainSeedConfig(client);
    const cfg = normalizeConfig(prev);
    let changed = false;
    for (const s of VOTE_SERVICES) {
      if (T.draftIsEmpty(cfg.votes.perService[s].reminderDraft)) {
        cfg.votes.perService[s].reminderDraft = seed.votes.perService[s].reminderDraft;
        cfg.votes.perService[s].reminderEnabled = seed.votes.perService[s].reminderEnabled;
        changed = true;
      }
    }
    cfg.seedVersion = MAIN_SEED_VERSION;
    cfg.userSaved = true;
    if (prev?.votes?.token) cfg.votes.token = prev.votes.token;
    await T.setGuildBlob("bumpVotes", gid, cfg);
    return changed;
  }
  if (prev && prevVersion >= MAIN_SEED_VERSION) return false;
  const seed = mainSeedConfig(client);
  if (prev?.votes?.token) seed.votes.token = prev.votes.token;
  await T.setGuildBlob("bumpVotes", gid, seed);
  return true;
}

/** Sul server principale: il modulo gestisce già questo servizio? (allora il sistema classico si ferma) */
async function moduleHandlesBump(guildId: string, service: Service) {
  const cfg = await getConfig(guildId).catch(() => null);
  return Boolean(cfg?.enabled && cfg.services[service]?.enabled);
}

/** Modulo voti acceso per Top.gg / Discadia → i DM reminder usano i draft dashboard. */
async function moduleHandlesVote(guildId: string, service: VoteService) {
  const cfg = await getConfig(guildId).catch(() => null);
  return Boolean(cfg?.votes?.enabled && cfg.votes[service]);
}

/**
 * Promemoria voto da draft dashboard.
 * - not_owned: modulo voti spento → usare embed classico
 * - skipped: modulo acceso ma reminder disattivato per il servizio (niente DM Discord)
 * - sent / failed: tentativo con draft
 */
async function trySendConfiguredVoteReminder(
  client?,
  user?,
  opts: { guildId?: string; userId?: string | null; voteListing?: string; asChannelFallback?: boolean; channel?: any } = {},
): Promise<"not_owned" | "skipped" | "sent" | "failed"> {
  const gid = String(opts.guildId || "");
  const service: VoteService | null = opts.voteListing === "topgg" ? "topgg" : opts.voteListing === "discadia" ? "discadia" : null;
  const uid = String(opts.userId || user?.id || "").trim();
  if (!client || !gid || !service || !uid) return "not_owned";
  try {
    if (!(await moduleHandlesVote(gid, service))) return "not_owned";
    const cfg = await getConfig(gid, true);
    const row = cfg.votes.perService[service];
    if (!row || row.reminderEnabled === false) return "skipped";
    const draft = row.reminderDraft;
    if (T.draftIsEmpty(draft)) return "failed";
    const body: any = T.buildMessageBody(draft, { service: VOTE_LABEL[service], server: "" }, [], { mentionUserId: null });
    if (opts.asChannelFallback && opts.channel?.send) {
      const payload: any = { ...body, content: [`<@${uid}>`, body.content || ""].filter(Boolean).join("\n").slice(0, 2000) };
      const sent = await opts.channel.send(payload).catch(() => null);
      return sent ? "sent" : "failed";
    }
    const rest = restOf(client);
    if (!rest) return "failed";
    const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: uid } }).catch(() => null);
    if (!dm?.id) return "failed";
    const sent = await rest.post(Routes.channelMessages(dm.id), { body }).then(() => true).catch(() => false);
    return sent ? "sent" : "failed";
  } catch (err) {
    global.logger?.warn?.("[BUMP VOTES] vote reminder draft:", (err as any)?.message || err);
    return "failed";
  }
}

/* ───────────── classifica ───────────── */

const nameCache = new Map<string, { at: number; name: string }>();
async function userName(client?, id?: string) {
  const hit = nameCache.get(String(id));
  if (hit && Date.now() - hit.at < 3_600_000) return hit.name;
  const u: any = await restOf(client)?.get(Routes.user(String(id))).catch(() => null);
  const name = String(u?.global_name || u?.username || id);
  nameCache.set(String(id), { at: Date.now(), name });
  return name;
}

async function leaderboard(client?, guildId?: string) {
  const st = await getState(String(guildId));
  const top = async (m: Record<string, number>) =>
    Promise.all(
      Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(async ([id, count]) => ({ id, name: await userName(client, id), count })),
    );
  return { bumps: await top(st.bumps), votes: await top(st.votes) };
}

async function resetLeaderboard(guildId: string, which: "bumps" | "votes") {
  const st = await getState(guildId);
  st[which] = {};
  await saveState(guildId, st);
}

export = {
  ensureMainSeed,
  moduleHandlesBump,
  moduleHandlesVote,
  SERVICES,
  getConfig,
  saveConfig,
  regenerateToken,
  handleTenantBumpMessage,
  handleVoteWebhook,
  trySendConfiguredVoteThanks,
  trySendConfiguredVoteReminder,
  startBumpVotesLoop,
  runBumpVotesTick,
  leaderboard,
  resetLeaderboard,
};
