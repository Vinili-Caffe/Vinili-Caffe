/**
 * Annunci automatici della dashboard: boost, eventi nominati (clan/status/inviti) e ruoli custom.
 * - boost: server tenant dal messaggio di sistema di Discord; sul principale resta il riconoscimento classico
 * - named: Guilded / Fan / Supporter / Promoter / Propulsor / Catalyst (una fonte, non in Ruoli custom)
 * - ruoli custom: regole freeform (ruoli → canale + messaggio), su tutti i server
 * Impostazioni e stato in BotState (tenantCommunityTools: announcements / announcementsState).
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const restOf = (client?) => client?.rest || client?._rest || null;
const ROLE_RULES_MAX = 40;
const SEED_VERSION = 6;

/* Supporter (bio) è nei ruoli custom: il ruolo lo dà lo staff a mano */
const NAMED_KEYS = ["clantag", "fan", "promoter", "propulsor", "catalyst"] as const;
type NamedKey = (typeof NAMED_KEYS)[number];

/* ───────────── impostazioni ───────────── */

function emptyDraft() {
  return T.normalizeDraft({ content: "", mentionUsers: false, mentionRoles: true, embed: { enabled: true, title: "", description: "", color: "#f47fff" }, buttons: [] });
}

/** messaggio privato opzionale accanto all'annuncio nel canale */
function normalizeDm(raw?, fallbackContent = "Ciao {username}! Hai ottenuto {role.name} in **{server}**.") {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: d.enabled === true,
    draft: d.draft ? T.normalizeDraft(d.draft) : T.normalizeDraft({ content: fallbackContent, embed: { enabled: false, title: "", description: "", color: "#f47fff" }, buttons: [] }),
  };
}

function roleIdList(v?) {
  return [...new Set<string>((Array.isArray(v) ? v : []).filter((x) => T.isId(x)).map(String))].slice(0, 10);
}

const TENURE_RULES_MAX = 15;
function normalizeTenureRule(raw?, i = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const days = Math.floor(Number(r.days));
  return {
    id: typeof r.id === "string" && /^[a-z0-9]{4,40}$/i.test(r.id) ? r.id : T.newId(),
    enabled: r.enabled !== false,
    days: Number.isFinite(days) && days >= 0 && days <= 3650 ? days : 30 * (i + 1),
    roleId: T.isId(r.roleId) ? String(r.roleId) : null,
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    draft: r.draft
      ? T.normalizeDraft(r.draft)
      : T.normalizeDraft({
          content: "{user}",
          mentionUsers: true,
          embed: { enabled: true, title: "Un traguardo! 🎉", description: "{user} è con noi da **{days} giorni** e ottiene {role}!", color: "#d49150" },
          buttons: [],
        }),
    dm: normalizeDm(r.dm, "Sei in **{server}** da {days} giorni: hai ottenuto {role.name}! 🎉"),
  };
}

function normalizeRoleRule(raw?, i = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const ids = (v?) => [...new Set<string>((Array.isArray(v) ? v : []).filter((x) => T.isId(x)).map(String))].slice(0, 25);
  const cd = Math.floor(Number(r.cooldownHours));
  return {
    id: typeof r.id === "string" && /^[a-z0-9]{4,40}$/i.test(r.id) ? r.id : T.newId(),
    name: String(r.name || "").trim().slice(0, 80) || `Regola ${i + 1}`,
    enabled: r.enabled !== false,
    roleIds: ids(r.roleIds),
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    /* stesso ruolo alla stessa persona: non ripetere l'annuncio entro queste ore (es. ruolo tolto e rimesso) */
    cooldownHours: Number.isFinite(cd) && cd >= 0 && cd <= 8760 ? cd : 24,
    draft: r.draft ? T.normalizeDraft(r.draft) : emptyDraft(),
    dm: normalizeDm(r.dm),
  };
}

function normalizeNamedSlot(key: NamedKey, raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  const cd = Math.floor(Number(r.cooldownHours));
  const defaults: Record<NamedKey, string> = {
    clantag: "Clan tag",
    fan: "Fan (status)",
    promoter: "Promoter",
    propulsor: "Propulsor",
    catalyst: "Catalyst",
  };
  return {
    id: `named:${key}`,
    name: String(r.name || "").trim().slice(0, 80) || defaults[key],
    enabled: r.enabled === true,
    roleId: T.isId(r.roleId) ? String(r.roleId) : null,
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    cooldownHours: Number.isFinite(cd) && cd >= 0 && cd <= 8760 ? cd : 24,
    draft: r.draft ? T.normalizeDraft(r.draft) : emptyDraft(),
    dm: normalizeDm(r.dm),
    /* solo Fan: testi che, scritti nello status, danno il ruolo (vuoto = link del server, regola classica) */
    statusTriggers:
      key === "fan"
        ? [...new Set<string>((Array.isArray(r.statusTriggers) ? r.statusTriggers : []).map((x) => String(x || "").trim().slice(0, 100)).filter(Boolean))].slice(0, 15)
        : [],
  };
}

/** Slot nominato → forma regola (stessa pipeline di invio/cooldown). */
function namedAsRule(slot: ReturnType<typeof normalizeNamedSlot>) {
  return {
    id: slot.id,
    name: slot.name,
    enabled: slot.enabled,
    roleIds: slot.roleId ? [slot.roleId] : [],
    channelId: slot.channelId,
    cooldownHours: slot.cooldownHours,
    draft: slot.draft,
    dm: slot.dm,
  };
}

function normalizeNamed(raw?) {
  const n = raw && typeof raw === "object" ? raw : {};
  const out = {} as Record<NamedKey, ReturnType<typeof normalizeNamedSlot>>;
  for (const key of NAMED_KEYS) out[key] = normalizeNamedSlot(key, n[key]);
  return out;
}

function normalizeConfig(raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  const b = r.boost && typeof r.boost === "object" ? r.boost : {};
  const rl = r.roles && typeof r.roles === "object" ? r.roles : {};
  const rulesRaw: any[] = Array.isArray(rl.rules) ? [...rl.rules] : [];
  /* vecchio slot "supporter" (scheda a parte) → regola dei ruoli custom, se nessuna regola ha già quel ruolo */
  const legacySup = r.named && typeof r.named === "object" ? r.named.supporter : null;
  if (legacySup && T.isId(legacySup.roleId) && !rulesRaw.some((x) => Array.isArray(x?.roleIds) && x.roleIds.map(String).includes(String(legacySup.roleId)))) {
    rulesRaw.unshift({
      id: "supporterbio",
      name: String(legacySup.name || "").trim() || "Supporter (bio)",
      enabled: legacySup.enabled === true,
      roleIds: [String(legacySup.roleId)],
      channelId: legacySup.channelId,
      cooldownHours: legacySup.cooldownHours,
      draft: legacySup.draft,
      dm: legacySup.dm,
    });
  }
  return {
    boost: {
      enabled: b.enabled === true,
      channelId: T.isId(b.channelId) ? String(b.channelId) : null,
      firstDraft: b.firstDraft
        ? T.normalizeDraft(b.firstDraft)
        : T.normalizeDraft({
            content: "{user}",
            mentionUsers: true,
            embed: { enabled: true, title: "Grazie per il boost! 💜", description: "{user} ha boostato **{server}**! Ora siamo a **{boosts}** boost.", color: "#f47fff" },
            buttons: [],
          }),
      /* dal secondo boost della stessa persona */
      repeatDraft: b.repeatDraft
        ? T.normalizeDraft(b.repeatDraft)
        : T.normalizeDraft({
            content: "{user}",
            mentionUsers: true,
            embed: { enabled: true, title: "Un altro boost! 💜", description: "{user} ha boostato di nuovo **{server}**! Ora siamo a **{boosts}** boost.", color: "#f47fff" },
            buttons: [],
          }),
      /* privato a chi boosta (stesso testo per primo boost e successivi) */
      dm: normalizeDm(b.dm, "Grazie per il boost a **{server}**, {username}! 💜"),
      /* ruoli dati da Vinili: al primo boost e dal secondo in poi */
      firstRoleIds: roleIdList(b.firstRoleIds),
      repeatRoleIds: roleIdList(b.repeatRoleIds),
      /* quando il boost finisce li toglie */
      removeRolesOnEnd: b.removeRolesOnEnd !== false,
    },
    named: normalizeNamed(r.named),
    /* ruoli d'anzianità: dopo tot giorni nel server */
    tenure: (() => {
      const tn = r.tenure && typeof r.tenure === "object" ? r.tenure : {};
      return {
        enabled: tn.enabled === true,
        /* una soglia nuova toglie i ruoli delle soglie più basse */
        removePrevious: tn.removePrevious !== false,
        rules: (Array.isArray(tn.rules) ? tn.rules : [])
          .slice(0, TENURE_RULES_MAX)
          .map((x, i) => normalizeTenureRule(x, i))
          .sort((a, b) => a.days - b.days),
      };
    })(),
    roles: {
      enabled: rl.enabled !== false,
      rules: rulesRaw.slice(0, ROLE_RULES_MAX).map((x, i) => normalizeRoleRule(x, i)),
    },
    seedVersion: Number.isInteger(r.seedVersion) ? r.seedVersion : 0,
    userSaved: r.userSaved === true,
  };
}
type AnnConfig = ReturnType<typeof normalizeConfig>;
type AnnRule = ReturnType<typeof normalizeRoleRule>;

function namedRoleIds(cfg: AnnConfig): Set<string> {
  const s = new Set<string>();
  for (const key of NAMED_KEYS) {
    const id = cfg.named[key]?.roleId;
    if (id) s.add(String(id));
  }
  return s;
}

/** Regole per un ruolo: named sempre; freeform solo se roles.enabled. */
function findRulesForRole(cfg: AnnConfig, roleId: string): AnnRule[] {
  const rid = String(roleId);
  const out: AnnRule[] = [];
  for (const key of NAMED_KEYS) {
    const slot = cfg.named[key];
    if (slot.roleId === rid) out.push(namedAsRule(slot));
  }
  if (cfg.roles.enabled !== false) {
    for (const r of cfg.roles.rules) {
      if (r.roleIds.includes(rid)) out.push(r);
    }
  }
  return out;
}

/** Named + (se accesi) ruoli custom. */
function allSendableRules(cfg: AnnConfig): AnnRule[] {
  const out: AnnRule[] = [];
  for (const key of NAMED_KEYS) {
    const slot = cfg.named[key];
    if (slot.roleId) out.push(namedAsRule(slot));
  }
  if (cfg.roles.enabled !== false) out.push(...cfg.roles.rules);
  return out;
}

async function getConfig(guildId: string, fresh = false): Promise<AnnConfig> {
  return normalizeConfig(await T.getGuildBlob("announcements", String(guildId), fresh));
}

async function saveConfig(guildId: string, raw?) {
  const prev = await getConfig(guildId, true);
  const next = normalizeConfig({ ...raw, seedVersion: prev.seedVersion, userSaved: true });
  /* non lasciare i roleId named anche in Ruoli custom */
  const reserved = namedRoleIds(next);
  if (reserved.size) {
    next.roles.rules = next.roles.rules
      .map((r) => ({ ...r, roleIds: r.roleIds.filter((id) => !reserved.has(String(id))) }))
      .filter((r) => r.roleIds.length > 0);
  }
  await T.setGuildBlob("announcements", String(guildId), next);
  return next;
}

/* ───────────── stato (boost per persona, ultimo annuncio di ruolo) ───────────── */

async function getState(guildId: string) {
  const s = (await T.getGuildBlob("announcementsState", String(guildId), true)) || {};
  return {
    boosts: s.boosts && typeof s.boosts === "object" ? s.boosts : {},
    roleAnnounced: s.roleAnnounced && typeof s.roleAnnounced === "object" ? s.roleAnnounced : {},
    lastBoostMessageId: String(s.lastBoostMessageId || ""),
    /* "regola:utente" → quando è stato dato (una volta sola: se lo togli a mano non torna) */
    tenureGiven: s.tenureGiven && typeof s.tenureGiven === "object" ? s.tenureGiven : {},
  };
}

/* ───────────── invio ───────────── */

function genderDraftForMember(draft?, member?) {
  if (!draft || !member) return draft;
  try {
    const { applyPronounGenderToTextForMember } = require("../../Vinili/Community/utils/pronounGenderUtils") as typeof import("../../Vinili/Community/utils/pronounGenderUtils");
    const next = JSON.parse(JSON.stringify(draft));
    if (typeof next.content === "string") next.content = applyPronounGenderToTextForMember(next.content, member);
    if (next.embed && typeof next.embed === "object") {
      for (const key of ["title", "description", "footerText", "authorName"]) {
        if (typeof next.embed[key] === "string") next.embed[key] = applyPronounGenderToTextForMember(next.embed[key], member);
      }
      if (Array.isArray(next.embed.fields)) {
        next.embed.fields = next.embed.fields.map((f?) => ({
          ...f,
          name: typeof f?.name === "string" ? applyPronounGenderToTextForMember(f.name, member) : f?.name,
          value: typeof f?.value === "string" ? applyPronounGenderToTextForMember(f.value, member) : f?.value,
        }));
      }
    }
    return next;
  } catch (_) {
    return draft;
  }
}

async function postDraft(client?, channelId?: string | null, draft?, vars: Record<string, string> = {}, mentionUserId: string | null = null, memberForGender = null) {
  const rest = restOf(client);
  if (!rest || !channelId || !draft || T.draftIsEmpty(draft)) return null;
  const gendered = genderDraftForMember(draft, memberForGender);
  const body: any = T.buildMessageBody(gendered, vars, [], { mentionUserId });
  return rest.post(Routes.channelMessages(channelId), { body }).catch((err?) => {
    global.logger?.warn?.("[ANNUNCI] invio non riuscito:", channelId, err?.rawError?.message || err?.message || err);
    return null;
  });
}

function boostVars(guild?, user?, extra: Record<string, string> = {}) {
  return T.memberVars(guild, user, {
    boosts: String(guild?.premiumSubscriptionCount ?? 0),
    tier: String(guild?.premiumTier ?? 0),
    ...extra,
  });
}

/** Annuncio boost con i testi della dashboard. Usato dai server tenant e dal riconoscimento classico del principale. */
/** Ruoli della dashboard a chi boosta (solo quelli che il bot può gestire). */
const annOn = (gid?) => (require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(String(gid || ""), "benvenuto");

async function giveBoostRoles(guild?, userOrMember?, repeat = false, cfg?: AnnConfig) {
  if (!annOn(guild?.id)) return;
  const c = cfg || (await getConfig(String(guild?.id || "")).catch(() => null));
  if (!c || !guild) return;
  const ids = repeat ? [...c.boost.firstRoleIds, ...c.boost.repeatRoleIds] : c.boost.firstRoleIds;
  if (!ids.length) return;
  const uid = String(userOrMember?.id || userOrMember?.user?.id || "");
  if (!uid) return;
  const member = userOrMember?.roles?.add ? userOrMember : await guild.members?.fetch?.(uid).catch(() => null);
  if (!member?.roles) return;
  const me = guild.members?.me;
  const ok = ids.filter((id) => {
    const r = guild.roles?.cache?.get(id);
    return r && !r.managed && me && r.position < me.roles.highest.position && !member.roles.cache?.has(id);
  });
  if (ok.length) await member.roles.add(ok, "Ruoli del boost (dashboard)").catch((err?) => global.logger?.warn?.("[ANNUNCI] ruoli boost:", guild.id, err?.message || err));
}

/** Boost finito: toglie i ruoli dati dalla dashboard (se l'opzione è accesa). */
async function handleBoostEnded(oldMember?, newMember?) {
  const guild = newMember?.guild;
  if (!guild || newMember?.user?.bot) return;
  if (!oldMember?.premiumSince || newMember.premiumSince) return;
  if (!annOn(guild.id)) return;
  const cfg = await getConfig(String(guild.id)).catch(() => null);
  if (!cfg?.boost.removeRolesOnEnd) return;
  const ids = [...new Set([...cfg.boost.firstRoleIds, ...cfg.boost.repeatRoleIds])].filter((id) => newMember.roles?.cache?.has(id));
  if (!ids.length) return;
  await newMember.roles.remove(ids, "Boost finito (dashboard)").catch((err?) => global.logger?.warn?.("[ANNUNCI] ruoli boost finito:", guild.id, err?.message || err));
}

async function sendBoostAnnouncement(client?, guild?, member?, opts: { repeat?: boolean; boostCount?: number; channelId?: string | null } = {}) {
  if (!annOn(guild?.id)) return null;
  const cfg = await getConfig(String(guild?.id || ""));
  await giveBoostRoles(guild, member, opts.repeat === true, cfg);
  /* annuncio nel canale e privato sono indipendenti: si può usare anche solo il privato */
  if (!cfg.boost.enabled && !cfg.boost.dm.enabled) return null;
  const channelId = cfg.boost.channelId || opts.channelId || null;
  const user = member?.user || member;
  const draft = opts.repeat ? cfg.boost.repeatDraft : cfg.boost.firstDraft;
  const vars = boostVars(guild, user, opts.boostCount ? { boosts: String(opts.boostCount) } : {});
  if (cfg.boost.dm.enabled && user?.id) await T.sendDraftDm(client, String(user.id), cfg.boost.dm.draft, vars);
  if (!cfg.boost.enabled) return null;
  return postDraft(client, channelId, draft, vars, String(user?.id || "") || null);
}

/** Server principale con l'annuncio classico nel canale: ruoli e privato della dashboard (se impostati). */
async function sendBoostDmOnly(client?, guild?, member?, boostCount?: number, repeat = false) {
  const cfg = await getConfig(String(guild?.id || "")).catch(() => null);
  if (!cfg || cfg.boost.enabled) return false;
  await giveBoostRoles(guild, member, repeat, cfg);
  if (!cfg.boost.dm.enabled) return false;
  const user = member?.user || member;
  if (!user?.id) return false;
  const vars = boostVars(guild, user, boostCount ? { boosts: String(boostCount) } : {});
  return (await T.sendDraftDm(client, String(user.id), cfg.boost.dm.draft, vars)).sent;
}

/** Server principale: l'annuncio dei boost è passato alla dashboard? */
async function boostModuleEnabled(guildId?) {
  const cfg = await getConfig(String(guildId || "")).catch(() => null);
  return Boolean(cfg?.boost.enabled);
}

/* tipi dei messaggi di sistema di Discord: boost e livelli */
const BOOST_MESSAGE_TYPES = new Set([8, 9, 10, 11]);

/** Server tenant: "X ha boostato il server" (un messaggio per ogni boost). */
async function handleTenantBoostMessage(message?) {
  const guild = message?.guild;
  const gid = String(guild?.id || "");
  if (!gid || !BOOST_MESSAGE_TYPES.has(Number(message?.type)) || T.isMainGuild(gid)) return false;
  if (!annOn(gid)) return false;
  const cfg = await getConfig(gid);
  if (!cfg.boost.enabled && !cfg.boost.dm.enabled && !cfg.boost.firstRoleIds.length && !cfg.boost.repeatRoleIds.length) return false;
  const st = await getState(gid);
  if (st.lastBoostMessageId === String(message.id)) return true;
  const uid = String(message.author?.id || "");
  const count = (Number(st.boosts[uid]) || 0) + 1;
  if (uid) st.boosts[uid] = count;
  st.lastBoostMessageId = String(message.id);
  await T.setGuildBlob("announcementsState", gid, st);
  await sendBoostAnnouncement(message.client, guild, message.member || message.author, {
    repeat: count > 1,
    channelId: cfg.boost.channelId || String(message.channelId),
  });
  return true;
}

/* ───────────── ruoli d'anzianità (dopo tot giorni nel server) ───────────── */

let tenureRunning = false;
async function runTenureRoles(client?) {
  if (tenureRunning || !client?.guilds?.cache) return;
  tenureRunning = true;
  try {
    const all = await T.allGuildBlobs("announcements").catch(() => ({}));
    for (const gid of Object.keys(all || {})) {
      const guild = client.guilds.cache.get(gid);
      if (!guild || !annOn(gid)) continue;
      const cfg = normalizeConfig(all[gid]);
      const rules = cfg.tenure.rules.filter((r) => r.enabled && r.roleId);
      if (!cfg.tenure.enabled || !rules.length) continue;
      const me = guild.members?.me;
      const st = await getState(gid);
      let changed = false;
      const now = Date.now();
      /* sul principale l'anzianità vale solo per chi ha completato la verifica (ruolo Member) */
      let mainMemberRole = "";
      if (T.isMainGuild(gid)) {
        try {
          mainMemberRole = String((require("../../Vinili/Config/ids") as any)?.roles?.Member || "");
        } catch (_) {}
      }
      for (const member of guild.members.cache.values()) {
        if (member.user?.bot || !member.joinedTimestamp) continue;
        if (mainMemberRole && !member.roles.cache.has(mainMemberRole)) continue;
        const daysIn = Math.floor((now - member.joinedTimestamp) / 86_400_000);
        /* la soglia più alta raggiunta (le regole sono in ordine di giorni) */
        const reached = rules.filter((r) => daysIn >= r.days);
        if (!reached.length) continue;
        const top = reached[reached.length - 1];
        const key = `${top.id}:${member.id}`;
        const role = guild.roles.cache.get(top.roleId as string);
        if (!role || role.managed || !me || role.position >= me.roles.highest.position) continue;
        if (!st.tenureGiven[key] && !member.roles.cache.has(role.id)) {
          const ok = await member.roles.add(role.id, `Anzianità: ${top.days} giorni nel server`).then(() => true, () => false);
          if (!ok) continue;
          st.tenureGiven[key] = now;
          changed = true;
          const vars = T.memberVars(guild, member.user, { role: `<@&${role.id}>`, "role.name": String(role.name || ""), days: String(top.days) });
          if (top.channelId) await postDraft(client, top.channelId, top.draft, vars, member.id, member);
          if (top.dm.enabled) await T.sendDraftDm(client, member.id, genderDraftForMember(top.dm.draft, member), vars);
        } else if (!st.tenureGiven[key]) {
          /* aveva già il ruolo: segnalo come dato, senza annunciare */
          st.tenureGiven[key] = now;
          changed = true;
        }
        /* togli i ruoli delle soglie più basse */
        if (cfg.tenure.removePrevious) {
          const lower = reached.slice(0, -1).map((r) => r.roleId as string).filter((id) => id !== role.id && member.roles.cache.has(id));
          if (lower.length) await member.roles.remove(lower, "Anzianità: soglia successiva raggiunta").catch(() => null);
        }
      }
      if (changed) await T.setGuildBlob("announcementsState", gid, st);
    }
  } catch (err) {
    global.logger?.warn?.("[ANNUNCI] anzianità:", (err as any)?.message || err);
  } finally {
    tenureRunning = false;
  }
}

/** Avvia il controllo ogni 30 minuti (processo del bot su Discord). */
function startTenureRolesLoop(client?) {
  if (!client || client.__tenureRolesTimer) return;
  setTimeout(() => void runTenureRoles(client), 60_000).unref?.();
  client.__tenureRolesTimer = setInterval(() => void runTenureRoles(client), 30 * 60_000);
  client.__tenureRolesTimer.unref?.();
}

/* ───────────── ruolo ottenuto (named + custom) ───────────── */

async function handleRoleAdded(oldMember?, newMember?) {
  const guild = newMember?.guild;
  const gid = String(guild?.id || "");
  if (!gid || newMember?.user?.bot) return;
  if (!annOn(gid)) return;
  /* senza i ruoli di prima non si sa cosa è cambiato: meglio non annunciare niente */
  if (oldMember?.partial || !oldMember?.roles?.cache) return;
  const added = [...newMember.roles.cache.keys()].filter((id) => !oldMember.roles.cache.has(id));
  if (!added.length) return;
  const cfg = await getConfig(gid);
  const candidates = allSendableRules(cfg).filter((r) => r.enabled && (r.channelId || r.dm.enabled) && r.roleIds.some((id) => added.includes(id)));
  if (!candidates.length) return;
  let restoredByMute: (g: string, u: string, r: string) => boolean = () => false;
  try {
    const m = require("../../Vinili/Moderation/utils/muteRestoreAnnounceSuppress") as any;
    if (typeof m.wasRoleRestoredByMuteMirror === "function") restoredByMute = m.wasRoleRestoredByMuteMirror;
  } catch (_) {}
  const st = await getState(gid);
  const now = Date.now();
  let changed = false;
  for (const rule of candidates) {
    const roleId = rule.roleIds.find((id) => added.includes(id)) as string;
    /* ruolo rimesso dopo un mute: non è un ruolo "nuovo" */
    if (restoredByMute(gid, newMember.id, roleId)) continue;
    const key = `${rule.id}:${newMember.id}`;
    if (rule.cooldownHours > 0 && now - Number(st.roleAnnounced[key] || 0) < rule.cooldownHours * 3_600_000) continue;
    const role = guild.roles.cache.get(roleId);
    const vars = T.memberVars(guild, newMember.user, { role: `<@&${roleId}>`, "role.name": String(role?.name || "") });
    const sent = rule.channelId ? await postDraft(newMember.client, rule.channelId, rule.draft, vars, newMember.id, newMember) : null;
    const dmSent = rule.dm.enabled ? (await T.sendDraftDm(newMember.client, newMember.id, genderDraftForMember(rule.dm.draft, newMember), vars)).sent : false;
    if (sent || dmSent) {
      st.roleAnnounced[key] = now;
      changed = true;
    }
  }
  if (changed) {
    /* tieni solo gli ultimi annunci (il resto è scaduto) */
    const keys = Object.keys(st.roleAnnounced);
    if (keys.length > 2000) for (const k of keys.sort((a, b) => st.roleAnnounced[a] - st.roleAnnounced[b]).slice(0, keys.length - 2000)) delete st.roleAnnounced[k];
    await T.setGuildBlob("announcementsState", gid, st);
  }
}

/** Server principale: il ruolo ha già una regola/slot acceso qui? (allora l'annuncio classico si ferma) */
async function roleRuleHandles(guildId?, roleId?) {
  const cfg = await getConfig(String(guildId || "")).catch(() => null);
  if (!cfg) return false;
  const rid = String(roleId || "");
  /* anche solo privato: il messaggio classico nel canale si ferma lo stesso */
  return findRulesForRole(cfg, rid).some((r) => r.enabled && (r.channelId || r.dm.enabled));
}

/**
 * Annuncio classico MAIN: se in dashboard c'è il draft per quel ruolo, usalo
 * (anche con regola spenta), così preview e live coincidono senza doppio post.
 * Se la regola è accesa, non inviare qui: ci pensa handleRoleAdded.
 */
async function trySendConfiguredRoleAnnounce(client?, member?, roleId?, opts: { fallbackChannelId?: string | null } = {}) {
  const guild = member?.guild;
  const gid = String(guild?.id || "");
  const rid = String(roleId || "");
  const uid = String(member?.id || "");
  if (!client || !guild || !gid || !rid || !uid) return false;
  try {
    const raw = await T.getGuildBlob("announcements", gid, true);
    if (!raw || typeof raw !== "object") return false;
    const cfg = normalizeConfig(raw);
    if (!cfg.userSaved && !(T.isMainGuild(gid) && Number(cfg.seedVersion) >= 1)) return false;
    const rule = findRulesForRole(cfg, rid).find((r) => r.channelId && !T.draftIsEmpty(r.draft));
    if (!rule) return false;
    /* regola accesa → handleRoleAdded (evita doppio annuncio) */
    if (rule.enabled) return false;
    const channelId = rule.channelId || (T.isId(opts.fallbackChannelId) ? String(opts.fallbackChannelId) : null);
    if (!channelId) return false;
    const st = await getState(gid);
    const key = `${rule.id}:${uid}`;
    const now = Date.now();
    if (rule.cooldownHours > 0 && now - Number(st.roleAnnounced[key] || 0) < rule.cooldownHours * 3_600_000) {
      return true; /* già annunciato di recente: non fallback hardcoded */
    }
    const role = guild.roles.cache.get(rid);
    const vars = T.memberVars(guild, member.user || member, { role: `<@&${rid}>`, "role.name": String(role?.name || "") });
    const sent = await postDraft(client, channelId, rule.draft, vars, uid, member);
    if (rule.dm.enabled) await T.sendDraftDm(client, uid, genderDraftForMember(rule.dm.draft, member), vars);
    if (sent) {
      st.roleAnnounced[key] = now;
      await T.setGuildBlob("announcementsState", gid, st);
      return true;
    }
  } catch (err) {
    global.logger?.warn?.("[ANNUNCI] classic role draft:", (err as any)?.message || err);
  }
  return false;
}

/* ───────────── import dal server principale ───────────── */

function mainSeedConfig() {
  const IDs = require("../../Vinili/Config/ids") as any;
  const { E } = require("../../shared/emojis/emojiCatalog") as any;
  const e = (k: string) => String(E?.[k] || "");
  let perkLine = "";
  try {
    perkLine = String((require("../../Vinili/Community/utils/mentionResponseAccessUtils") as any).MENTION_RESPONSE_PERK_LINE_DISCORD || "");
  } catch (_) {}
  let verifiedImage = "";
  try {
    const { botPhotoCdnUrl } = require("../../shared/discord/botPhotosCdn") as any;
    verifiedImage = String(botPhotoCdnUrl("verificaselfie.png") || "");
  } catch (_) {}
  const supporters = String(IDs?.channels?.supporters || "") || null;
  const staffPing = "1442568910070349985";
  const boostEmbed = (title: string, lines: string[]) => ({
    content: `${e("VC_Boost")} \`|\`  {user} \`|\` <@&${staffPing}>`,
    embed: {
      enabled: true,
      title: "",
      description: [`### ${e("ThankYou")} **__${title}__**`, "", ...lines, "", `${e("flyingnitroboost")} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.`, "", `${e("VC_Link")} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`].join("\n"),
      color: "#826bc2",
      authorName: "{user.name}",
      authorIconUrl: "{avatar}",
      thumbnailUrl: "{avatar}",
      footerText: "Ora siamo a {boosts} boost!",
    },
    buttons: [],
  });
  const first = boostEmbed("GRAZIE {user} PER IL BOOST!", [
    `${e("VC_Boost")} **Boostando il server una volta hai sbloccato questi vantaggi:**`,
    `${e("sparkledred")} Ruolo Server Booster con badge speciale`,
    `${e("VC_NewsExclamation")} Permesso di cambiare il nickname`,
    `${e("moon")} Permesso di allegare immagini e link in chat`,
    `${e("pinkstar")} Permesso di mandare emoji e adesivi di altri server`,
    `${e("sparkle")} Permesso di usare le Soundboard del server`,
    `${e("VC_Winner")} Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te`,
    `${e("blueflash")} Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/)`,
    `${e("VC_CrownYellow")} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)`,
    ...(perkLine ? [perkLine] : []),
    `${e("VC_Money")} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)`,
    `${e("reddiamond")} Sblocchi i comandi \`+quote\` e \`+repost\` (gestione dal profilo sul sito)`,
    `${e("exp")} X2 EXP Boost`,
  ]);
  const second = boostEmbed("GRAZIE {user} PER IL DOPPIO BOOST!", [
    `${e("VC_Boost")} **Boostando il server due volte hai sbloccato questi vantaggi:**`,
    `${e("sparkledred")} Ruolo Double Booster con badge speciale`,
    `${e("moon")} Tutti i perks precedenti`,
    `${e("sparkle")} Permesso di usare le Soundboard esterne`,
    `${e("VC_Color")} Sfondo personalizzato per la tua card del comando \`+rank\``,
    `${e("VC_Flame")} Possibilità di aggiungere reazioni ai messaggi in chat`,
    `${e("blueflash")} Possibilità di creare un secondo ruolo **custom** e un canale **vocale privato custom**`,
    `${e("VC_CrownYellow")} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)`,
    ...(perkLine ? [perkLine] : []),
    `${e("VC_Money")} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi)`,
    `${e("reddiamond")} Bypass requisiti dei giveaway`,
    `${e("exp")} X3 EXP Boost`,
  ]);

  const nuovxDraft = (title: string, lines: string[], imageUrl = "") => ({
    content: "{user}",
    mentionUsers: true,
    mentionRoles: true,
    embed: {
      enabled: true,
      title,
      description: ["{user}, `hai sbloccato:`", ...lines].join("\n"),
      color: "#6f4e37",
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      thumbnailUrl: "{avatar}",
      footerText: "Grazie per il tuo supporto!",
      ...(imageUrl ? { imageUrl } : {}),
    },
    buttons: [],
  });
  const namedSlot = (name: string, roleId: string, title: string, lines: string[], imageUrl = "") =>
    roleId
      ? {
          name,
          enabled: false,
          roleId,
          channelId: supporters,
          cooldownHours: 24,
          draft: nuovxDraft(title, lines, imageUrl),
        }
      : null;
  const nuovxRule = (name: string, roleId: string, title: string, lines: string[], imageUrl = "") =>
    roleId
      ? {
          name,
          enabled: false,
          roleIds: [roleId],
          channelId: supporters,
          cooldownHours: 24,
          draft: nuovxDraft(title, lines, imageUrl),
        }
      : null;

  const guildedRole = String(IDs?.roles?.Guilded || "");
  const followerRole = String(IDs?.roles?.Follower || "");
  const supporterRole = String(IDs?.roles?.SocialSupporter || "");
  const fanRole = String(IDs?.roles?.Fan || "");
  const patronRole = String(IDs?.roles?.Patron || "");
  const verificato = String(IDs?.roles?.Verificato || "");
  const verificata = String(IDs?.roles?.Verificata || "");
  const verifiedNeo = String(IDs?.roles?.VerifiedNeo || "");
  const donator = String(IDs?.roles?.Donator || "");
  const vip = String(IDs?.roles?.VIP || "");
  const vipPlus = String(IDs?.roles?.VIPplus || "");
  const promoter = String(IDs?.roles?.Promoter || "");
  const propulsor = String(IDs?.roles?.Propulsor || "");
  const catalyst = String(IDs?.roles?.Catalyst || "");
  const infoChannel = String(IDs?.channels?.info || "");

  const unlockPicNick = [
    `${e("VC_Reply")} Ti è stato assegnato il ruolo {role}!`,
    `${e("VC_Infinity")} - Permesso di allegare immagini e link in chat`,
    `${e("VC_HeartWhite")} - Permesso di cambiare il nickname`,
  ];
  const perksSite = `${e("VC_Arrow")} Scopri i tuoi vantaggi sul nostro [sito](https://viniliecaffe.it/perks).`;
  const invitePerksLine = infoChannel
    ? `${e("VC_Arrow")} Dettagli perk: <#${infoChannel}>`
    : perksSite;

  const namedRaw: Partial<Record<NamedKey, ReturnType<typeof namedSlot>>> = {
    clantag: namedSlot("Clan tag", guildedRole, `Nuovx Guilded ${e("VC_StarPink")}`, [
      ...unlockPicNick,
      "",
      `${e("VC_Arrow")} Grazie per aver scelto la nostra tag! Scopri tutti i vantaggi [qui](https://viniliecaffe.it/perks)`,
    ]),
    fan: namedSlot("Fan (status)", fanRole, `Nuovx Fan ${e("VC_StarPink")}`, [
      `${e("VC_Reply")} Ti verrà dato entro **3 minuti** dal bot!`,
      `${e("VC_Infinity")} - Permesso di allegare immagini e link in chat`,
      `${e("VC_HeartWhite")} - Permesso di cambiare nickname`,
      "",
      `${e("VC_Arrow")} Metti il link del server nel tuo status.`,
    ]),
    promoter: namedSlot("Promoter", promoter, "🎀✦ Nuovx Promoter!", [
      `${e("VC_Reply")} Hai ricevuto {role} — **Promoter**`,
      `${e("VC_Infinity")} - Permesso di allegare immagini e link in chat`,
      `${e("VC_HeartWhite")} - Permesso di cambiare il nickname`,
      "",
      "Per il prossimo ruolo raggiungi **25 inviti** con il tuo link personalizzato.",
      invitePerksLine,
    ]),
    propulsor: namedSlot("Propulsor", propulsor, "✨ Nuovx Propulsor!", [
      `${e("VC_Reply")} Hai ricevuto {role} — **Propulsor**`,
      `${e("VC_Infinity")} - Tutti i perks di Promoter`,
      `${e("VC_HeartWhite")} - Permesso di mandare sticker ed emoji di altri server`,
      `${e("VC_Flame")} - Permesso di aggiungere reazioni ai messaggi`,
      "",
      "Per il prossimo ruolo raggiungi **100 inviti** con il tuo link personalizzato.",
      invitePerksLine,
    ]),
    catalyst: namedSlot("Catalyst", catalyst, "🏆 Nuovx Catalyst!", [
      `${e("VC_Reply")} Hai ricevuto {role} — **Catalyst**`,
      `${e("VC_Infinity")} - Tutti i perks di Propulsor`,
      `${e("VC_HeartWhite")} - Permesso di usare soundboard esterne`,
      "",
      "Hai raggiunto la soglia massima degli inviti reward!",
      invitePerksLine,
    ]),
  };

  const rules = [
    nuovxRule("Supporter (bio)", supporterRole, `Nuovx Supporter ${e("VC_StarPink")}`, [
      ...unlockPicNick,
      "",
      `${e("VC_Arrow")} Metti \`.gg/viniliecaffe\`, \`discord.gg/viniliecaffe\` o \`viniliecaffe.it\` nella tua bio.`,
    ]),
    nuovxRule("Nuovx Follower", followerRole, `Nuovx Follower ${e("VC_StarPink")}`, [
      ...unlockPicNick,
      "",
      `${e("VC_Arrow")} Seguici su [Instagram](https://instagram.com/viniliecaffe) e su [TikTok](https://tiktok.com/@viniliecaffe).`,
    ]),
    nuovxRule("Nuovx Verified he/him", verificato, `Nuovx Verified ʰᵉᐟʰⁱᵐ ${e("VC_StarPink")}`, [...unlockPicNick, "", perksSite], verifiedImage),
    nuovxRule("Nuovx Verified she/her", verificata, `Nuovx Verified ˢʰᵉᐟʰᵉʳ ${e("VC_StarPink")}`, [...unlockPicNick, "", perksSite], verifiedImage),
    nuovxRule("Nuovx Verified they", verifiedNeo, `Nuovx Verified ⁿ^ᐟꜝ ${e("VC_StarPink")}`, [...unlockPicNick, "", perksSite], verifiedImage),
    nuovxRule("Nuovx Patron", patronRole, `Nuovx Patron ${e("VC_StarPink")}`, [
      `${e("VC_Reply")} Ti è stato assegnato il ruolo {role}!`,
      `${e("VC_Dot")} - Possibilità di **scrivere in gigante**`,
      "",
      `${e("VC_Arrow")} Hai completato i prerequisiti social.`,
      perksSite,
    ]),
    donator
      ? {
          name: "Pacchetto Donator",
          enabled: false,
          roleIds: [donator],
          channelId: supporters,
          cooldownHours: 24,
          draft: {
            content: `${e("VC_Money")} \`|\` {user}`,
            mentionUsers: true,
            embed: {
              enabled: true,
              title: "",
              description: [
                `### ${e("ThankYou")} **__{user} HAI RICEVUTO IL RUOLO DONATOR!__**`,
                "",
                "**Con questo ruolo hai sbloccato i seguenti vantaggi:**",
                "",
                `${e("sparkledred")} Permesso di allegare **link e immagini** in chat`,
                `${e("sparkle")} Permesso di usare le **Soundboard** di altri server`,
                `${e("pinkstar")} Permesso di mandare **sticker ed emoji** di altri server`,
                `${e("reddiamond")} Bypass dei requisiti nei **giveaway**`,
                `${e("moon")} Permesso di cambiare il tuo **nickname**`,
                `${e("blueflash")} Sblocchi i **COLORI PLUS** in [Personalizza](https://www.viniliecaffe.it/personalizza/)`,
                `${e("reddiamond")} Sblocchi i comandi \`+quote\` e \`+repost\``,
                `${e("exp")} X4 EXP boost`,
                "",
                `${e("VC_Link")} [viniliecaffe.it](<https://viniliecaffe.it>)`,
              ].join("\n"),
              color: "#826bc2",
              authorName: "{username}",
              authorIconUrl: "{avatar}",
              thumbnailUrl: "{avatar}",
            },
            buttons: [],
          },
        }
      : null,
    vip
      ? {
          name: "Pacchetto VIP",
          enabled: false,
          roleIds: [vip],
          channelId: supporters,
          cooldownHours: 24,
          draft: {
            content: `${e("VC_Money")} \`|\` {user}`,
            mentionUsers: true,
            embed: {
              enabled: true,
              title: "",
              description: [
                `### ${e("ThankYou")} **__{user} HAI RICEVUTO IL RUOLO VIP!__**`,
                "",
                "**Con questo ruolo hai sbloccato i seguenti vantaggi:**",
                "",
                `${e("sparkledred")} Tutti i perks del ruolo Donator`,
                `${e("VC_Flame")} Reazioni ai messaggi in chat`,
                `${e("VC_Winner")} Vocale privata`,
                `${e("VC_Color")} Ruolo custom gradiente`,
                `${e("exp")} X5 EXP boost`,
                "",
                `${e("VC_Link")} [viniliecaffe.it](<https://viniliecaffe.it>)`,
              ].join("\n"),
              color: "#826bc2",
              authorName: "{username}",
              authorIconUrl: "{avatar}",
              thumbnailUrl: "{avatar}",
            },
            buttons: [],
          },
        }
      : null,
    vipPlus
      ? {
          name: "Pacchetto VIP+",
          enabled: false,
          roleIds: [vipPlus],
          channelId: supporters,
          cooldownHours: 24,
          draft: {
            content: `${e("VC_Money")} \`|\` {user}`,
            mentionUsers: true,
            embed: {
              enabled: true,
              title: "",
              description: [
                `### ${e("ThankYou")} **__{user} HAI RICEVUTO IL RUOLO VIP+!__**`,
                "",
                "**Con questo ruolo hai sbloccato i seguenti vantaggi:**",
                "",
                `${e("sparkledred")} Tutti i perks del ruolo VIP`,
                `${e("exp")} X6 EXP boost`,
                "",
                `${e("VC_Link")} [viniliecaffe.it](<https://viniliecaffe.it>)`,
              ].join("\n"),
              color: "#826bc2",
              authorName: "{username}",
              authorIconUrl: "{avatar}",
              thumbnailUrl: "{avatar}",
            },
            buttons: [],
          },
        }
      : null,
  ].filter(Boolean);

  const tenureRole = (k: string) => String(IDs?.roles?.[k] || "") || null;
  const tenureSeed = {
    /* spente: il sistema classico continua finché non le accendi da qui */
    enabled: false,
    removePrevious: true,
    rules: [
      { days: 0, roleId: tenureRole("NuovoUtente"), channelId: null },
      { days: 30, roleId: tenureRole("Veterano"), channelId: null },
      { days: 365, roleId: tenureRole("OG"), channelId: null },
    ].filter((r) => r.roleId),
  };

  return normalizeConfig({
    tenure: tenureSeed,
    boost: { enabled: false, channelId: supporters, firstDraft: first, repeatDraft: second },
    named: namedRaw,
    roles: { enabled: true, rules },
    seedVersion: SEED_VERSION,
  });
}

function namedSlotIsEmpty(slot: ReturnType<typeof normalizeNamedSlot>) {
  return !slot.roleId && T.draftIsEmpty(slot.draft);
}

/** Prima apertura / upgrade seed sul principale: importa named + regole custom mancanti. */
async function ensureMainSeed(guildId?) {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("announcements", gid, true);
  const seed = mainSeedConfig();
  if (!prev) {
    await T.setGuildBlob("announcements", gid, seed);
    return true;
  }
  const prevVer = Number(prev.seedVersion || 0);
  const next = normalizeConfig(prev);
  let changed = false;

  /* migra regole freeform → named (una sola fonte) */
  for (const key of NAMED_KEYS) {
    const seedSlot = seed.named[key];
    const cur = next.named[key];
    if (!seedSlot.roleId) continue;
    const fromRule = next.roles.rules.find((r) => r.roleIds.includes(seedSlot.roleId!));
    if (namedSlotIsEmpty(cur)) {
      if (fromRule) {
        next.named[key] = normalizeNamedSlot(key, {
          name: fromRule.name || seedSlot.name,
          enabled: fromRule.enabled === true,
          roleId: seedSlot.roleId,
          channelId: fromRule.channelId || seedSlot.channelId,
          cooldownHours: fromRule.cooldownHours,
          draft: fromRule.draft,
        });
      } else {
        next.named[key] = seedSlot;
      }
      changed = true;
    } else if (!cur.roleId && !next.userSaved) {
      /* ruolo tolto apposta dalla dashboard: non rimetterlo */
      next.named[key] = normalizeNamedSlot(key, { ...cur, roleId: seedSlot.roleId });
      changed = true;
    } else if (T.draftIsEmpty(cur.draft) && !T.draftIsEmpty(seedSlot.draft)) {
      next.named[key] = normalizeNamedSlot(key, { ...cur, draft: seedSlot.draft, channelId: cur.channelId || seedSlot.channelId });
      changed = true;
    }
  }

  const reserved = namedRoleIds(next);
  const before = next.roles.rules.length;
  next.roles.rules = next.roles.rules
    .map((r) => ({ ...r, roleIds: r.roleIds.filter((id) => !reserved.has(String(id))) }))
    .filter((r) => r.roleIds.length > 0);
  if (next.roles.rules.length !== before) changed = true;

  const covered = new Set(next.roles.rules.flatMap((r) => r.roleIds.map(String)));
  let added = 0;
  for (const rule of seed.roles.rules) {
    if (!rule.roleIds.length) continue;
    if (rule.roleIds.some((id) => reserved.has(String(id)))) continue;
    if (rule.roleIds.some((id) => covered.has(String(id)))) continue;
    next.roles.rules.push(rule);
    for (const id of rule.roleIds) covered.add(String(id));
    added += 1;
  }
  if (added > 0) changed = true;

  /* anzianità: se non ci sono ancora soglie, quelle del sistema classico */
  if (!next.tenure.rules.length && seed.tenure.rules.length) {
    next.tenure = seed.tenure;
    changed = true;
  }

  if (!changed && prevVer >= SEED_VERSION) return false;
  next.seedVersion = Math.max(prevVer, SEED_VERSION);
  next.userSaved = prev.userSaved === true;
  await T.setGuildBlob("announcements", gid, next);
  return true;
}

export = {
  ROLE_RULES_MAX,
  NAMED_KEYS,
  getConfig,
  saveConfig,
  ensureMainSeed,
  sendBoostAnnouncement,
  sendBoostDmOnly,
  startTenureRolesLoop,
  runTenureRoles,
  handleBoostEnded,
  boostModuleEnabled,
  handleTenantBoostMessage,
  handleRoleAdded,
  roleRuleHandles,
  trySendConfiguredRoleAnnounce,
};
