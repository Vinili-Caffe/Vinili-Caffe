/** Chat del workflow: suggerimenti di menzioni ed emoji. */
const { SiteWorkflowChatMessage } = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { listGuildMentionChannels, memberCanViewChannelId } = require("../tickets/siteWebTicketsApi") as typeof import("../tickets/siteWebTicketsApi");
const { displayNameForMember } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { bearerFromRequest, resolveWorkflowChatAccess } = require("./workflowChatAccess") as typeof import("./workflowChatAccess");

async function handleSiteStaffWorkflowChatEmojisGet(client?, req?, res?) {
  try {
    const dedupeKey = String(req.query?.dedupeKey || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    await access.guild.emojis.fetch().catch(() => null);
    const emojis = [...access.guild.emojis.cache.values()].map((e?) => ({
      id: String(e.id),
      name: String(e.name || ""),
      animated: Boolean(e.animated),
    }));
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).json({ ok: true, guildId: access.guild.id, count: emojis.length, emojis });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat emojis:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatMentionsGet(client?, req?, res?) {
  try {
    const dedupeKey = String(req.query?.dedupeKey || req.query?.key || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const q = String(req.query?.q || "")
      .trim()
      .replace(/^[@#]+/, "")
      .toLowerCase()
      .slice(0, 40);
    const kind = String(req.query?.kind || "all").trim().toLowerCase();
    const filter = String(req.query?.filter || "all").trim().toLowerCase(); // all|users|roles
    const wantChannels = kind === "channels";
    const guild = access.guild;
    const guildId = String(guild?.id || "").trim();

    if (wantChannels) {
      const all = await listGuildMentionChannels(client, guildId);
      const visible = all.filter((row?) => memberCanViewChannelId(access.member, guild, row.id));
      const channels = visible
        .filter((row?) => {
          if (!q) return true;
          const name = String(row.name || "").toLowerCase();
          const parent = String(row.parentName || "").toLowerCase();
          return name.includes(q) || parent.includes(q) || String(row.id).includes(q);
        })
        .slice(0, 80);
      return res.status(200).json({ ok: true, channels, users: [], roles: [] });
    }

    const byUserId = new Map();
    const putUser = (row?) => {
      if (!row?.id || byUserId.has(row.id)) return;
      byUserId.set(row.id, row);
    };

    const authors = await SiteWorkflowChatMessage.find({
      guildId,
      dedupeKey: access.dedupeKey,
      authorKind: { $ne: "system" },
    })
      .select("authorId authorName authorAvatarUrl")
      .lean()
      .catch(() => []);

    const seed = [
      access.subjectUserId
        ? {
            id: String(access.subjectUserId),
            name: "Utente",
            avatarUrl: "",
          }
        : null,
      ...(authors || []).map((a?) => ({
        id: String(a.authorId || ""),
        name: String(a.authorName || "Utente").trim() || "Utente",
        avatarUrl: String(a.authorAvatarUrl || ""),
      })),
    ];
    for (const s of seed) {
      if (!s?.id) continue;
      putUser({
        type: "user",
        id: s.id,
        name: s.name,
        username: null,
        avatarUrl: s.avatarUrl || "",
        markup: `<@${s.id}>`,
      });
    }

    if (access.isStaffReviewer) {
      try {
        const { getCachedStaffRoster } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
        const roster = await getCachedStaffRoster(client);
        const people = Array.isArray(roster?.sections)
          ? roster.sections.flatMap((s?) => (Array.isArray(s?.members) ? s.members : []))
          : Array.isArray(roster?.people)
            ? roster.people
            : [];
        for (const p of people) {
          const id = String(p?.userId || p?.id || "").trim();
          if (!id) continue;
          putUser({
            type: "user",
            id,
            name: String(p?.displayName || p?.username || p?.name || "Staff").trim() || "Staff",
            username: String(p?.username || "").trim() || null,
            avatarUrl: String(p?.avatarUrl || p?.avatar || ""),
            markup: `<@${id}>`,
            roleName: String(p?.roleName || p?.roleLabel || "").trim() || null,
          });
        }
      } catch (_) {}

      try {
        if (q && typeof guild.members?.search === "function") {
          const found = await guild.members.search({ query: q, limit: 12 }).catch(() => null);
          const list = found && typeof found.values === "function" ? [...found.values()] : [];
          for (const m of list) {
            const id = String(m?.id || m?.user?.id || "").trim();
            if (!id || m.user?.bot) continue;
            putUser({
              type: "user",
              id,
              name: displayNameForMember(m),
              username: String(m.user?.username || "").trim() || null,
              avatarUrl: "",
              markup: `<@${id}>`,
            });
          }
        }
      } catch (_) {}
    }

    let users = [...byUserId.values()];
    if (q) {
      users = users.filter((u?) => {
        const hay = `${u.name || ""} ${u.username || ""} ${u.id}`.toLowerCase();
        return hay.includes(q);
      });
    }
    users = users.slice(0, 24);

    let roles = [];
    if (access.isStaffReviewer && filter !== "users") {
      try {
        const { listGuildPickerData } = require("../../Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../Partner/dashboard/siteDashboardPartnershipApi");
        const pickers = await listGuildPickerData(client, guildId, { force: false });
        const allowedRoleIds = new Set();
        for (const u of users) {
          const m = guild.members?.cache?.get?.(u.id);
          if (!m?.roles?.cache) continue;
          for (const rid of m.roles.cache.keys()) {
            if (String(rid) !== guildId) allowedRoleIds.add(String(rid));
          }
        }
        roles = (Array.isArray(pickers?.roles) ? pickers.roles : [])
          .filter((r?) => r && String(r.id) !== guildId)
          .filter((r?) => !allowedRoleIds.size || allowedRoleIds.has(String(r.id)))
          .filter((r?) => {
            if (!q) return true;
            const name = String(r.name || "").toLowerCase();
            return name.includes(q) || String(r.id).includes(q);
          })
          .slice(0, 20)
          .map((r?) => ({
            type: "role",
            id: String(r.id),
            name: String(r.name || "ruolo"),
            color: r.color || null,
            markup: `<@&${r.id}>`,
          }));
      } catch (_) {
        roles = [];
      }
    }

    if (filter === "roles") users = [];
    if (filter === "users") roles = [];

    return res.status(200).json({ ok: true, users, roles, channels: [] });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat mentions:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteStaffWorkflowChatEmojisGet, handleSiteStaffWorkflowChatMentionsGet };
