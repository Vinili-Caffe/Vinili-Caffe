/**
 * Compleanni della dashboard (modulo "compleanni"), in tutti i server col bot.
 *
 * Il compleanno è uno per persona (salvato sotto il server principale, da Personalizza) e vale ovunque:
 * ogni server con il modulo acceso e un canale scelto annuncia, all'ora scelta e nel suo fuso,
 * i compleanni di chi è nel server. Più compleanni lo stesso giorno = un solo messaggio.
 * Ruolo del giorno (tolto il giorno dopo) e privato facoltativo (al massimo uno al giorno per persona).
 *
 * Chi compie gli anni sceglie dove annunciarlo: "all" ovunque, "main" solo nel principale, "none" da nessuna parte.
 * Sul principale ruolo flair, ruoli d'età e ×2 EXP restano del sistema classico (birthdayService).
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

type BirthdaysConfig = {
  seedVersion: number;
  userSaved: boolean;
  channelId: string | null;
  /** ora locale dell'annuncio (0–23) */
  hour: number;
  draft: ReturnType<typeof T.normalizeDraft>;
  roleId: string | null;
  dm: { enabled: boolean; draft: ReturnType<typeof T.normalizeDraft> };
  /** reazioni aggiunte all'annuncio (emoji o <:nome:id>) */
  reactions: string[];
};

const SEED_VERSION = 1;
const BIRTHDAYS_TICK_MS = 5 * 60_000;

const moduleOn = (gid?) => (require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(String(gid || ""), "compleanni");
const mainGuildId = () => String((require("../../Vinili/Config/ids") as any)?.guilds?.main || "");

function defaultDraft() {
  return T.normalizeDraft({
    content: "{users}",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "🎂 Buon compleanno!",
      description: "Oggi è il compleanno di {users}. {agetext}\nFate tanti auguri! 🎉",
      color: "#f08fb0",
      imageUrl: "",
      thumbnailUrl: "{avatar}",
      footerText: "{server}",
      timestamp: false,
      authorName: "",
      authorIconUrl: "",
    },
  });
}

function defaultDmDraft() {
  return T.normalizeDraft({
    content: "Tanti auguri da **{server}**, {username}! 🎂",
    embed: { ...T.normalizeDraft({}).embed, enabled: false },
  });
}

function normalizeConfig(raw?): BirthdaysConfig {
  const r = raw && typeof raw === "object" ? raw : {};
  const hour = Math.floor(Number(r.hour));
  return {
    seedVersion: Math.max(0, Math.floor(Number(r.seedVersion) || 0)),
    userSaved: r.userSaved === true,
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0,
    draft: r.draft && typeof r.draft === "object" ? T.normalizeDraft(r.draft) : defaultDraft(),
    roleId: T.isId(r.roleId) ? String(r.roleId) : null,
    dm: {
      enabled: r.dm?.enabled === true,
      draft: r.dm?.draft && typeof r.dm.draft === "object" ? T.normalizeDraft(r.dm.draft) : defaultDmDraft(),
    },
    reactions: (Array.isArray(r.reactions) ? r.reactions : []).map((x: unknown) => String(x || "").trim()).filter(Boolean).slice(0, 5),
  };
}

async function getConfig(guildId: string, fresh = false): Promise<BirthdaysConfig> {
  return normalizeConfig(await T.getGuildBlob("birthdays", String(guildId), fresh));
}

async function saveConfig(guildId: string, raw?): Promise<BirthdaysConfig> {
  const prev = await getConfig(guildId, true);
  const next = normalizeConfig({ ...prev, ...(raw && typeof raw === "object" ? raw : {}), seedVersion: prev.seedVersion, userSaved: true });
  await T.setGuildBlob("birthdays", String(guildId), next);
  return next;
}

/** Il principale: l'annuncio che il bot fa adesso (canale chat, stesso testo, stesse reazioni), solo la prima volta. */
async function ensureMainSeed(guildId?) {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("birthdays", gid, true);
  if (prev && Number(prev.seedVersion) >= SEED_VERSION) return false;
  const IDs = require("../../Vinili/Config/ids") as any;
  const { E } = require("../../shared/emojis/emojiCatalog") as any;
  const e = (k: string) => String(E?.[k] || "");
  const seed = normalizeConfig({
    ...(prev || {}),
    seedVersion: SEED_VERSION,
    channelId: prev?.channelId || IDs?.channels?.chat || null,
    hour: 0,
    roleId: prev?.roleId || IDs?.roles?.birthdayFlair || null,
    reactions: [e("VC_Events"), e("VC_HelloKittyGift"), e("VC_bluparty")].filter(Boolean),
    draft:
      prev?.draft ||
      T.normalizeDraft({
        content: [
          `${e("creation")} Oggi è il compleanno di {users}.`,
          `${e("VC_Events")} {agetext} Tantissimi auguri!{exptext}`,
          "",
          `${e("VC_Arrow")} Vuoi festeggiare anche tu? Aggiungi il compleanno su https://www.viniliecaffe.it/personalizza/ — il giorno del tuo compleanno ricevi un **multi EXP ×2** per tutta la giornata.`,
        ].join("\n"),
        mentionUsers: true,
        embed: { ...T.normalizeDraft({}).embed, enabled: false },
      }),
  });
  await T.setGuildBlob("birthdays", gid, seed);
  return !prev;
}

/** Sul principale l'annuncio lo fa la dashboard? (modulo acceso e canale scelto) */
async function managesMessage(guildId?) {
  const gid = String(guildId || "");
  if (!gid || !moduleOn(gid)) return false;
  return Boolean((await getConfig(gid)).channelId);
}

/* ───────────── date e persone ───────────── */

function localParts(tz: string, d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) };
}

const dateKey = (p: { year: number; month: number; day: number }) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function timezoneOf(guildId: string) {
  try {
    return (require("../core/tenantGuildSettings") as typeof import("../core/tenantGuildSettings")).getTenantTimezoneSync(guildId) || "Europe/Rome";
  } catch (_) {
    return "Europe/Rome";
  }
}

type Birthday = { userId: string; day: number; month: number; birthYear: number | null; showAge: boolean; scope: string };

/** Chi compie gli anni in quella data (il 29 febbraio, negli anni normali, festeggia il 28). */
async function birthdaysOn(day: number, month: number, year: number): Promise<Birthday[]> {
  const { ActivityUserProfile } = require("../../Vinili/Community/schemas/communitySchemas") as any;
  const mainId = mainGuildId();
  const or: any[] = [{ "profile.birthday.day": day, "profile.birthday.month": month }];
  if (month === 2 && day === 28 && !isLeap(year)) or.push({ "profile.birthday.day": 29, "profile.birthday.month": 2 });
  const docs: any[] = await ActivityUserProfile.find({ guildId: mainId, $or: or }).select("userId profile.birthday").lean().catch(() => []);
  return docs
    .map((d) => {
      const b = d?.profile?.birthday || {};
      return {
        userId: String(d.userId || ""),
        day: Number(b.day),
        month: Number(b.month),
        birthYear: Number(b.birthYear) || null,
        showAge: b.showAge !== false,
        scope: ["all", "main", "none"].includes(String(b.announceScope)) ? String(b.announceScope) : "all",
      };
    })
    .filter((b) => T.isId(b.userId) && b.scope !== "none");
}

function joinNicely(list: string[]) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function messageVars(guild?, firstUser?, list: Birthday[] = [], year = new Date().getFullYear()) {
  const mentions = list.map((b) => `<@${b.userId}>`);
  const ages = list.filter((b) => b.showAge && b.birthYear).map((b) => Math.max(1, year - Number(b.birthYear)));
  const agetext = !ages.length ? "" : list.length === 1 ? `Oggi compie **${ages[0]}** anni.` : `Oggi compiono ${joinNicely(ages.map((a) => `**${a}**`))} anni.`;
  const exptext = T.isMainGuild(String(guild?.id || "")) ? " E per oggi c'è un **×2 EXP**!" : "";
  return T.memberVars(guild, firstUser, {
    users: joinNicely(mentions),
    count: String(list.length),
    age: list.length === 1 && ages.length ? String(ages[0]) : "",
    agetext,
    exptext,
  });
}

/* ───────────── invio ───────────── */

async function sendFor(client?, guild?, cfg?: BirthdaysConfig, list: Birthday[] = [], year = new Date().getFullYear()) {
  const rest = client?.rest;
  if (!rest || !guild || !cfg?.channelId || !list.length) return null;
  const first = await client.users.fetch(list[0].userId).catch(() => null);
  const body: any = T.buildMessageBody(cfg.draft, messageVars(guild, first, list, year), [], { mentionUserId: null });
  const sent: any = await rest.post(Routes.channelMessages(cfg.channelId), { body }).catch((err?) => {
    global.logger?.warn?.("[COMPLEANNI] invio:", guild.id, err?.rawError?.message || err?.message || err);
    return null;
  });
  if (sent?.id) {
    for (const r of cfg.reactions) {
      const emoji = encodeURIComponent(r.replace(/^<a?:/, "").replace(/>$/, ""));
      await rest.put(Routes.channelMessageOwnReaction(cfg.channelId, sent.id, emoji)).catch(() => null);
    }
  }
  return sent;
}

async function giveRoleAndDm(client?, guild?, cfg?: BirthdaysConfig, list: Birthday[] = [], date = "") {
  const st = (await T.getGuildBlob("birthdaysState", guild.id, true)) || {};
  const roleGiven: Record<string, string> = st.roleGiven && typeof st.roleGiven === "object" ? st.roleGiven : {};
  const me = guild.members?.me;
  const role = cfg?.roleId ? guild.roles.cache.get(cfg.roleId) : null;
  const roleOk = Boolean(role && !role.managed && me && role.position < me.roles.highest.position);
  const { tryClaimBotStateOnce } = require("../../shared/botState/botStateStore") as any;
  for (const b of list) {
    if (roleOk) {
      const member = await guild.members.fetch(b.userId).catch(() => null);
      if (member && !member.roles.cache.has(role.id)) {
        const ok = await member.roles.add(role.id, "Compleanno").then(() => true, () => false);
        if (ok) roleGiven[b.userId] = date;
      }
    }
    /* un solo privato al giorno per persona, anche se è in tanti server */
    if (cfg?.dm.enabled && (await tryClaimBotStateOnce(`birthdayDm:${b.userId}:${date}`, { source: "birthdays" }).catch(() => false))) {
      const user = await client.users.fetch(b.userId).catch(() => null);
      await T.sendDraftDm(client, b.userId, cfg.dm.draft, messageVars(guild, user, [b], Number(date.slice(0, 4)))).catch(() => null);
    }
  }
  await T.setGuildBlob("birthdaysState", guild.id, { ...st, roleGiven });
}

/** Il giorno dopo: toglie il ruolo del compleanno. */
async function removeOldRoles(guild?, cfg?: BirthdaysConfig, today = "") {
  const st = (await T.getGuildBlob("birthdaysState", guild.id, true)) || {};
  const roleGiven: Record<string, string> = st.roleGiven && typeof st.roleGiven === "object" ? { ...st.roleGiven } : {};
  const old = Object.entries(roleGiven).filter(([, d]) => d !== today);
  if (!old.length) return;
  for (const [uid] of old) {
    if (cfg?.roleId) {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member?.roles?.cache?.has(cfg.roleId)) await member.roles.remove(cfg.roleId, "Fine del compleanno").catch(() => null);
    }
    delete roleGiven[uid];
  }
  await T.setGuildBlob("birthdaysState", guild.id, { ...st, roleGiven });
}

/** Chi tra questi è nel server e vuole l'annuncio qui. */
async function membersHere(guild?, list: Birthday[] = []) {
  const main = T.isMainGuild(String(guild?.id || ""));
  const out: Birthday[] = [];
  for (const b of list) {
    if (b.scope === "main" && !main) continue;
    const here = guild.members.cache.has(b.userId) || Boolean(await guild.members.fetch(b.userId).catch(() => null));
    if (here) out.push(b);
  }
  return out;
}

let ticking = false;

/** Giro ogni 5 minuti: ogni server annuncia una volta al giorno, all'ora scelta nel suo fuso. */
async function runBirthdaysTick(client?) {
  if (ticking || !client?.guilds?.cache) return;
  ticking = true;
  try {
    await ensureMainSeed(mainGuildId()).catch(() => false);
    const all = await T.allGuildBlobs("birthdays").catch(() => ({}));
    const { tryClaimBotStateOnce } = require("../../shared/botState/botStateStore") as any;
    const byDate = new Map<string, Birthday[]>();
    for (const [gid, raw] of Object.entries(all || {})) {
      const guild = client.guilds.cache.get(gid);
      if (!guild || !moduleOn(gid)) continue;
      const cfg = normalizeConfig(raw);
      const now = localParts(timezoneOf(gid));
      const today = dateKey(now);
      await removeOldRoles(guild, cfg, today).catch(() => null);
      if (!cfg.channelId || now.hour < cfg.hour) continue;
      if (!byDate.has(today)) byDate.set(today, await birthdaysOn(now.day, now.month, now.year));
      const list = byDate.get(today) || [];
      if (!list.length) continue;
      if (!(await tryClaimBotStateOnce(`birthdays:${gid}:${today}`, { source: "birthdays" }).catch(() => false))) continue;
      const here = await membersHere(guild, list);
      if (!here.length) continue;
      await sendFor(client, guild, cfg, here, now.year);
      await giveRoleAndDm(client, guild, cfg, here, today);
    }
  } catch (err) {
    global.logger?.warn?.("[COMPLEANNI] giro:", (err as any)?.message || err);
  } finally {
    ticking = false;
  }
}

/**
 * Compleanno salvato oggi, dopo l'annuncio del giorno: festeggia subito chi è nel server
 * (solo se oggi l'annuncio di quel server è già partito, altrimenti ci pensa il giro).
 */
async function celebrateLate(client?, guild?, userIds: string[] = []) {
  if (!guild || !moduleOn(guild.id)) return;
  const cfg = await getConfig(guild.id);
  if (!cfg.channelId) return;
  const now = localParts(timezoneOf(guild.id));
  const today = dateKey(now);
  const { getBotState } = require("../../shared/botState/botStateStore") as any;
  const claimed = await Promise.resolve(getBotState?.(`birthdays:${guild.id}:${today}`)).catch(() => null);
  if (!claimed) return;
  const list = (await birthdaysOn(now.day, now.month, now.year)).filter((b) => userIds.includes(b.userId));
  const here = await membersHere(guild, list);
  if (!here.length) return;
  await sendFor(client, guild, cfg, here, now.year);
  await giveRoleAndDm(client, guild, cfg, here, today);
}

function startBirthdaysLoop(client?) {
  if (!client || client.__birthdaysTimer) return;
  setTimeout(() => void runBirthdaysTick(client), 90_000).unref?.();
  client.__birthdaysTimer = setInterval(() => void runBirthdaysTick(client), BIRTHDAYS_TICK_MS);
  client.__birthdaysTimer.unref?.();
}

export = {
  SEED_VERSION,
  normalizeConfig,
  getConfig,
  saveConfig,
  ensureMainSeed,
  managesMessage,
  runBirthdaysTick,
  celebrateLate,
  startBirthdaysLoop,
  sendFor,
  messageVars,
};
