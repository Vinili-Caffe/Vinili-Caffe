/**
 * "Salute del bot": cosa non può funzionare nel server e perché (permessi mancanti, canali cancellati,
 * ruoli più in alto del bot). Calcola i permessi veri del bot canale per canale, con gli override,
 * come fa Discord. GET /webhooks/site-dashboard/guilds/:guildId/health
 */
const { Routes, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");

type Level = "ok" | "warn" | "error" | "info";
type Check = { id: string; area: string; level: Level; title: string; detail: string; fix: string | null; channelId?: string | null };

const P = PermissionFlagsBits;
const PERM_IT: [bigint, string][] = [
  [P.Administrator, "Amministratore"],
  [P.ViewChannel, "Visualizzare il canale"],
  [P.SendMessages, "Inviare messaggi"],
  [P.EmbedLinks, "Incorporare link"],
  [P.AttachFiles, "Allegare file"],
  [P.ReadMessageHistory, "Leggere la cronologia"],
  [P.AddReactions, "Aggiungere reazioni"],
  [P.UseExternalEmojis, "Usare emoji esterne"],
  [P.ManageChannels, "Gestire i canali"],
  [P.ManageRoles, "Gestire i ruoli / permessi"],
  [P.ManageMessages, "Gestire i messaggi"],
  [P.ManageWebhooks, "Gestire i webhook"],
  [P.MentionEveryone, "Menzionare @everyone e @here"],
  [P.ChangeNickname, "Cambiare nickname"],
  [P.ManageThreads, "Gestire i thread"],
  [P.SendMessagesInThreads, "Inviare messaggi nei thread"],
];
const permName = (bit: bigint) => PERM_IT.find(([b]) => b === bit)?.[1] || String(bit);

const BASIC = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory];
const cache = new Map();

function big(v?) {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
}

function channelPerms(base: bigint, channel?, roleIds?: Set<string>, botId?, guildId?) {
  if ((base & P.Administrator) === P.Administrator) return { perms: ~0n, admin: true };
  let perms = base;
  const ows = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  const everyone = ows.find((o?) => String(o.id) === String(guildId));
  if (everyone) perms = (perms & ~big(everyone.deny)) | big(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const o of ows) {
    if (Number(o.type) === 0 && roleIds?.has(String(o.id))) {
      allow |= big(o.allow);
      deny |= big(o.deny);
    }
  }
  perms = (perms & ~deny) | allow;
  const mine = ows.find((o?) => Number(o.type) === 1 && String(o.id) === String(botId));
  if (mine) perms = (perms & ~big(mine.deny)) | big(mine.allow);
  /* senza Visualizzare il canale non vale niente altro */
  if ((perms & P.ViewChannel) !== P.ViewChannel) perms = 0n;
  return { perms, admin: false };
}

async function getDashboardHealth(client?, accessToken?, guildId?) {
  const access: any = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  const gid = access.guildId;
  const hit = cache.get(gid);
  if (hit && Date.now() - hit.at < 20_000) return hit.out;

  const rest = client?._rest || client?.rest;
  if (!rest) return { ok: false, status: 503, error: "unavailable", message: "Bot non raggiungibile." };
  const botId = String(client?.user?.id || (await rest.get(Routes.user()).catch(() => null))?.id || "");
  const [roles, member, channels]: any[] = await Promise.all([
    rest.get(Routes.guildRoles(gid)).catch(() => null),
    botId ? rest.get(Routes.guildMember(gid, botId)).catch(() => null) : null,
    rest.get(Routes.guildChannels(gid)).catch(() => null),
  ]);
  if (!Array.isArray(roles) || !member || !Array.isArray(channels)) {
    return { ok: true, status: 200, guildId: gid, botPresent: false, checks: [], summary: { error: 0, warn: 0, ok: 0 } };
  }

  const roleById = new Map(roles.map((r?) => [String(r.id), r]));
  const botRoleIds = new Set<string>((member.roles || []).map(String));
  let base = big(roleById.get(gid)?.permissions);
  for (const rid of botRoleIds) base |= big(roleById.get(rid)?.permissions);
  const admin = (base & P.Administrator) === P.Administrator;
  const botTop = Math.max(0, ...[...botRoleIds].map((rid) => Number(roleById.get(rid)?.position) || 0));
  const chanById = new Map(channels.map((c?) => [String(c.id), c]));

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  /* ── permessi generali ── */
  const missingBase = [...BASIC, P.AttachFiles, P.AddReactions, P.UseExternalEmojis].filter((b) => (base & b) !== b);
  if (admin) {
    add({
      id: "admin",
      area: "generale",
      level: "info",
      title: "Il bot ha il permesso Amministratore",
      detail: "Tutto funziona, ma è più sicuro dare al ruolo del bot solo i permessi che servono.",
      fix: null,
    });
  } else if (missingBase.length) {
    add({
      id: "base",
      area: "generale",
      level: missingBase.some((b) => BASIC.includes(b)) ? "error" : "warn",
      title: "Mancano permessi di base al ruolo del bot",
      detail: `Mancano: ${missingBase.map(permName).join(", ")}.`,
      fix: "Impostazioni server → Ruoli → ruolo del bot: attiva questi permessi.",
    });
  } else {
    add({ id: "base", area: "generale", level: "ok", title: "Permessi di base a posto", detail: "Il bot può leggere, scrivere e mandare embed.", fix: null });
  }

  /* ── canali configurati ── */
  const channelCheck = (id: string, area: string, label: string, chId: unknown, need: bigint[], hint?: string) => {
    const cid = String(chId || "").trim();
    if (!/^\d{16,22}$/.test(cid)) return;
    const ch = chanById.get(cid);
    if (!ch) {
      add({ id, area, level: "error", title: `${label}: il canale non esiste più`, detail: "Il canale scelto è stato cancellato o il bot non lo vede.", fix: "Scegline un altro dalla dashboard.", channelId: cid });
      return;
    }
    const { perms } = channelPerms(base, ch, botRoleIds, botId, gid);
    const missing = need.filter((b) => (perms & b) !== b);
    const name = String(ch.name || cid);
    if (missing.length) {
      add({
        id,
        area,
        level: "error",
        title: `${label}: il bot non può lavorare in #${name}`,
        detail: `Nel canale mancano: ${missing.map(permName).join(", ")}.${hint ? ` ${hint}` : ""}`,
        fix: `Apri #${name} → Modifica canale → Permessi → aggiungi il ruolo del bot e attiva questi permessi.`,
        channelId: cid,
      });
    } else {
      add({ id, area, level: "ok", title: `${label}: #${name}`, detail: "Il bot ha tutti i permessi che servono.", fix: null, channelId: cid });
    }
  };

  /* impostazioni generali + bacheca */
  try {
    const { getTenantSettingsSnapshotSync } = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
    const s: any = getTenantSettingsSnapshotSync(gid) || {};
    channelCheck("updates", "generale", "Canale aggiornamenti", s.updatesChannelId, [...BASIC, P.ManageWebhooks], "Per seguire il canale novità di Vinili serve anche Gestire i webhook.");
    const b = s.boards || {};
    if (b.enabled !== false) {
      const need = [...BASIC, P.AttachFiles];
      if (b.mode === "shared" || !b.mode) channelCheck("boards", "bacheca", "Bacheca", b.sharedChannelId, need);
      else {
        channelCheck("boards-quote", "bacheca", "Bacheca · quote", b.quoteChannelId, need);
        channelCheck("boards-repost", "bacheca", "Bacheca · repost", b.repostChannelId, need);
        channelCheck("boards-clip", "bacheca", "Bacheca · clip", b.clipChannelId, need);
        channelCheck("boards-skull", "bacheca", "Bacheca · skullboard", b.skullChannelId, need);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[DASH HEALTH] settings:", err?.message || err);
  }

  /* ticket */
  try {
    const { getTicketSettingsSync } = require("../../tickets/tenant/tenantTicketSettings") as typeof import("../../tickets/tenant/tenantTicketSettings");
    const { getGuildPanels } = require("../../tickets/tenant/tenantTicketPanels") as typeof import("../../tickets/tenant/tenantTicketPanels");
    const t: any = getTicketSettingsSync(gid) || {};
    const panels: any = await getGuildPanels(gid).catch(() => ({ singles: [], multis: [] }));
    const singles = Array.isArray(panels?.singles) ? panels.singles : [];
    const ticketsOn = t.enabled !== false && singles.length > 0;
    if (ticketsOn) {
      if (!admin && ((base & P.ManageChannels) !== P.ManageChannels || (base & P.ManageRoles) !== P.ManageRoles)) {
        add({
          id: "tickets-manage",
          area: "ticket",
          level: "error",
          title: "Il bot non può creare i canali dei ticket",
          detail: "Per aprire un ticket il bot crea un canale e ne imposta i permessi: servono Gestire i canali e Gestire i ruoli.",
          fix: "Impostazioni server → Ruoli → ruolo del bot: attiva Gestire i canali e Gestire i ruoli.",
        });
      }
      const seen = new Set();
      for (const p of singles) {
        const cid = String(p?.channelId || "");
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        channelCheck(`panel-${cid}`, "ticket", `Pannello «${String(p?.title || "ticket").slice(0, 40)}»`, cid, BASIC);
      }
      channelCheck("ticket-category", "ticket", "Categoria dei ticket", t.overflowCategoryId, [P.ViewChannel, P.ManageChannels, P.ManageRoles]);
      channelCheck("ticket-transcripts", "ticket", "Canale transcript", t.transcriptChannelId || t.logChannelId, [...BASIC, P.AttachFiles]);
      if (t.staleAlertEnabled === true) channelCheck("ticket-alerts", "ticket", "Avvisi ticket fermi", t.staleAlertChannelId, BASIC);
      const blRole = String(t.blacklistRoleId || "").trim();
      if (/^\d{16,22}$/.test(blRole) && roleById.has(blRole) && Number(roleById.get(blRole).position) >= botTop) {
        add({
          id: "ticket-bl-role",
          area: "ticket",
          level: "warn",
          title: `Il ruolo @${roleById.get(blRole).name} è sopra il bot`,
          detail: "Il bot non può dare o togliere ruoli che stanno più in alto del suo.",
          fix: "Impostazioni server → Ruoli: trascina il ruolo del bot sopra questo ruolo.",
        });
      }
    }
  } catch (err) {
    global.logger?.warn?.("[DASH HEALTH] tickets:", err?.message || err);
  }

  /* partnership */
  try {
    const { getPartnershipConfigSync } = require("../../../Vinili/Partner/core/tenantPartnershipSettings") as typeof import("../../../Vinili/Partner/core/tenantPartnershipSettings");
    const c: any = getPartnershipConfigSync(gid) || {};
    if (c.partnershipsChannelId) {
      const pings = c.pings || {};
      const needEveryone = Number(pings.hereMembers) > 0 || Number(pings.everyoneMembers) > 0 || pings.here != null || pings.everyone != null;
      channelCheck(
        "partnership",
        "partnership",
        "Canale partnership",
        c.partnershipsChannelId,
        needEveryone ? [...BASIC, P.MentionEveryone] : BASIC,
        needEveryone ? "Con i ping @here/@everyone attivi serve anche Menzionare @everyone." : undefined,
      );
      channelCheck("partnership-logs", "partnership", "Log partnership", c.logsChannelId, BASIC);
    }
  } catch (err) {
    global.logger?.warn?.("[DASH HEALTH] partnership:", err?.message || err);
  }

  const order: Record<Level, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  const summary = {
    error: checks.filter((c) => c.level === "error").length,
    warn: checks.filter((c) => c.level === "warn").length,
    ok: checks.filter((c) => c.level === "ok").length,
  };
  const out = {
    ok: true,
    status: 200,
    guildId: gid,
    botPresent: true,
    admin,
    botRole: (() => {
      const top = [...botRoleIds].map((rid) => roleById.get(rid)).filter(Boolean).sort((a?, b?) => Number(b.position) - Number(a.position))[0];
      return top ? { id: String(top.id), name: String(top.name), position: Number(top.position) || 0, total: roles.length } : null;
    })(),
    checks,
    summary,
    checkedAt: Date.now(),
  };
  cache.set(gid, { at: Date.now(), out });
  return out;
}

export = { getDashboardHealth };
