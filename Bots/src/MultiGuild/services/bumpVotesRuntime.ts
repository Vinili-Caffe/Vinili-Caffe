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
      return [s, { draft: draftOr(x.draft, vth.draft, DEFAULT_VOTE_THANKS), hours: hoursOr(x.hours, v.reward?.hours ? hoursOr(v.reward.hours) : DEFAULT_VOTE_HOURS[s]) }];
    }),
  ) as Record<VoteService, { draft: any; hours: number }>;
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
    /* import dal sistema del server principale */
    seedVersion: Number.isInteger(r.seedVersion) ? r.seedVersion : 0,
    userSaved: r.userSaved === true,
  };
}
type BumpConfig = ReturnType<typeof normalizeConfig>;

async function getConfig(guildId: string, fresh = false): Promise<BumpConfig> {
  return normalizeConfig(await T.getGuildBlob("bumpVotes", guildId, fresh));
}

async function saveConfig(guildId: string, raw?) {
  const prev = await getConfig(guildId, true);
  const next = normalizeConfig({ ...raw, votes: { ...(raw?.votes || {}), token: prev.votes.token }, seedVersion: prev.seedVersion, userSaved: true });
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
  roleExpiry: { userId: string; roleId: string; until: number }[];
};

async function getState(guildId: string): Promise<State> {
  const s = (await T.getGuildBlob("bumpVotesState", guildId, true)) || {};
  return {
    last: s.last && typeof s.last === "object" ? s.last : {},
    bumps: s.bumps && typeof s.bumps === "object" ? s.bumps : {},
    votes: s.votes && typeof s.votes === "object" ? s.votes : {},
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

function userVars(guild?, userId?: string | null) {
  return {
    user: userId ? `<@${userId}>` : "Qualcuno",
    "user.id": userId || "",
    server: String(guild?.name || ""),
  };
}

/* ───────────── riconoscimento bump ───────────── */

const DISBOARD_OK = ["bump done", "bump successful", "has been bumped", "successfully bumped", "was bumped", "server bumped", "bump effettuato"];
const DISCADIA_OK = ["has been successfully bumped", "successfully bumped", "bumped successfully", "boost earned", "bump done", "thanks for bumping"];

function messageText(message?) {
  const parts: string[] = [];
  if (message?.content) parts.push(message.content);
  for (const e of message?.embeds || []) {
    for (const t of [e?.title, e?.description, e?.footer?.text, e?.author?.name]) if (t) parts.push(String(t));
    for (const f of e?.fields || []) parts.push(String(f?.name || ""), String(f?.value || ""));
  }
  return parts.join("\n").toLowerCase().replace(/\s+/g, " ");
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
async function handleTenantBumpMessage(message?) {
  const guildId = String(message?.guild?.id || "");
  if (!guildId || !message?.author?.bot) return false;
  const service = detectBump(message);
  if (!service) return false;
  const cfg = await getConfig(guildId);
  if (!cfg.enabled || !cfg.services[service].enabled) return false;
  const st = await getState(guildId);
  if (st.last[service]?.messageId === String(message.id)) return true;
  const userId = String(message.interactionMetadata?.user?.id || message.interaction?.user?.id || "") || null;
  const now = Date.now();
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
    await sendDraft(message.client, String(message.channelId), cfg.services[service].thanksDraft, { ...userVars(message.guild, userId), service: SERVICE_LABEL[service], count: String(userId ? st.bumps[userId] : 0) }, userId);
  }
  return true;
}

/* ───────────── voti (webhook) ───────────── */

async function handleVoteWebhook(client?, guildId?: string, service?: string, token?: string, body?) {
  const gid = String(guildId || "");
  if (!T.isId(gid) || (service !== "topgg" && service !== "discadia")) return { status: 404, text: "Not found" };
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
  st.votes[userId] = (st.votes[userId] || 0) + 1;
  await giveTimedRole(client, gid, userId, { roleId: cfg.votes.rewardRoleId, hours: cfg.votes.perService[service].hours }, st);
  await saveState(gid, st);
  if (cfg.votes.thanks.enabled && cfg.votes.channelId) {
    const label = VOTE_LABEL[service];
    await sendDraft(client, cfg.votes.channelId, cfg.votes.perService[service].draft, { ...userVars(null, userId), service: label, count: String(st.votes[userId]) }, userId);
  }
  return { status: 200, text: "OK" };
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
const MAIN_SEED_VERSION = 2;
function mainSeedConfig(client?) {
  const IDs = require("../../Vinili/Config/ids") as any;
  const { E } = require("../../shared/emojis/emojiCatalog") as any;
  const e = (k: string) => String(E?.[k] || "");
  const cfgMain = client?.config || {};
  const voterRole = String(IDs?.roles?.Voter || "") || null;
  const voteUrl = String(cfgMain?.topgg?.votePageUrl || "https://www.viniliecaffe.it/vote");
  const hours: Record<VoteService, number> = {
    topgg: Math.max(1, Math.round(Number(cfgMain?.topgg?.voteReminderCooldownHours) || 12)),
    discadia: Math.max(1, Math.round(Number(cfgMain?.discadiaVoteReminder?.cooldownHours) || 24)),
  };
  const bumpThanks = {
    content: `${e("VC_ThankYou")} **__Grazie {user} per aver \`bumpato\` il server!__** Bump fatti: {count}`,
    embed: { enabled: false },
    buttons: [],
  };
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
          `${e("VC_Money")} ${e("VC_Arrow")} ${voterRole ? `Il ruolo <@&${voterRole}> per ${label}` : `Ricompensa per ${label}`}`,
          "",
          `${e("VC_update")} Vota di nuovo tra __${label}__ dal **bottone sottostante**. Voti fatti: {count}`,
        ].join("\n"),
        color: "#6f4e37",
      },
      buttons: [{ label: "Vota cliccando qui", url: voteUrl, emoji: e("VC_HeartPink"), row: 0 }],
    };
  };
  return normalizeConfig({
    enabled: false,
    services: {
      disboard: {
        enabled: true,
        cooldownMinutes: Number(cfgMain?.disboard?.cooldownMinutes) || 120,
        thanksDraft: bumpThanks,
        reminderDraft: reminder(`${e("VC_Eye")} **È L'ORA DEL \`BUMP\`!**`, "https://disboard.org/it/server/1329080093599076474"),
      },
      discadia: {
        enabled: true,
        cooldownMinutes: Number(cfgMain?.discadia?.cooldownMinutes) || 1440,
        thanksDraft: bumpThanks,
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
      perService: { topgg: { draft: voteThanks("topgg"), hours: hours.topgg }, discadia: { draft: voteThanks("discadia"), hours: hours.discadia } },
    },
    seedVersion: MAIN_SEED_VERSION,
  });
}

/** Prima apertura sul principale: importa le impostazioni attuali. */
async function ensureMainSeed(client?, guildId?: string) {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("bumpVotes", gid, true);
  /* si reimporta solo se non l'hai ancora toccato e l'import è di una versione vecchia */
  if (prev && (prev.userSaved === true || Number(prev.seedVersion || 1) >= MAIN_SEED_VERSION)) return false;
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
  SERVICES,
  getConfig,
  saveConfig,
  regenerateToken,
  handleTenantBumpMessage,
  handleVoteWebhook,
  startBumpVotesLoop,
  runBumpVotesTick,
  leaderboard,
  resetLeaderboard,
};
