const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { sanitizeDiscordChannelName } = require("../utils/discordDisplayName") as typeof import("../utils/discordDisplayName");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { listReadableStaffGuideSections, memberCanReadStaffGuideSection } = require("../../Staff/utils/staffGuideAccess") as typeof import("../../Staff/utils/staffGuideAccess");
const { buildStaffGuideSectionMarkdown, getStaffGuideSectionMeta, getStaffGuideChildSectionIds, listStaffGuideSectionMeta } = require("../../Staff/utils/staffGuideContent") as typeof import("../../Staff/utils/staffGuideContent");
const { discordGuideMarkdownToHtml: convertGuideMarkdown, buildDefaultUserNameMap, buildDefaultRoleNameMap, buildDefaultChannelNameMap, humanizeIdKey } = require("../../site/http/discordGuideMarkdown") as typeof import("../../site/http/discordGuideMarkdown");

function buildRoleNameMap(guild?) {
  const map = buildDefaultRoleNameMap(IDs);
  const roles = IDs.roles || {};
  for (const [key, id] of Object.entries(roles)) {
    const rid = String(id || "").trim();
    if (!rid) continue;
    const fromGuild = guild?.roles?.cache?.get?.(rid);
    if (fromGuild?.name) map.set(rid, fromGuild.name);
    else if (!map.has(rid)) map.set(rid, humanizeIdKey(key) || key);
  }
  if (guild?.roles?.cache) {
    for (const role of guild.roles.cache.values()) {
      if (role?.id && role?.name) map.set(String(role.id), role.name);
    }
  }
  return map;
}

function buildChannelNameMap(guild?) {
  const map = buildDefaultChannelNameMap(IDs);
  const channels = IDs.channels || {};
  for (const [key, id] of Object.entries(channels)) {
    const cid = String(id || "").trim();
    if (!cid) continue;
    const fromGuild = guild?.channels?.cache?.get?.(cid);
    if (fromGuild?.name) map.set(cid, sanitizeDiscordChannelName(fromGuild.name));
    else if (!map.has(cid)) map.set(cid, sanitizeDiscordChannelName(humanizeIdKey(key) || key));
  }
  if (guild?.channels?.cache) {
    for (const ch of guild.channels.cache.values()) {
      if (ch?.id && ch?.name) map.set(String(ch.id), sanitizeDiscordChannelName(ch.name));
    }
  }
  return map;
}

function collectMentionUserIds(markdown?) {
  const ids = [];
  const re = /<@!?(\d{16,22})>/g;
  let m;
  const text = String(markdown || "");
  while ((m = re.exec(text))) ids.push(m[1]);
  return [...new Set(ids)];
}

async function resolveGuideUserNames(client?, guild?, markdown?) {
  const map = buildDefaultUserNameMap(IDs);
  if (guild?.members?.cache) {
    for (const member of guild.members.cache.values()) {
      const uid = String(member?.id || member?.user?.id || "").trim();
      if (!uid) continue;
      const label = String(
        member?.displayName || member?.user?.globalName || member?.user?.username || "",
      ).trim();
      if (label) map.set(uid, label);
    }
  }
  const users = guild?.client?.users?.cache;
  if (users) {
    for (const user of users.values()) {
      const uid = String(user?.id || "").trim();
      if (!uid || map.has(uid)) continue;
      const label = String(user?.globalName || user?.username || "").trim();
      if (label) map.set(uid, label);
    }
  }
  const missing = collectMentionUserIds(markdown).filter((id?) => !map.has(id));
  if (!missing.length || !client?.users?.fetch) return map;
  const chunkSize = 5;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid?) => {
        try {
          const user = await client.users.fetch(uid);
          const label = String(user?.globalName || user?.username || "").trim();
          if (label) map.set(uid, label);
        } catch {
          /* ignore */
        }
      }),
    );
  }
  return map;
}

function mapToRecord(map?) {
  const out: Record<string, string> = {};
  if (!map || typeof map.entries !== "function") return out;
  for (const [id, name] of map.entries()) {
    const key = String(id || "").trim();
    const label = String(name || "").trim();
    if (key && label) out[key] = label;
  }
  return out;
}

function cleanRoleDisplayName(name?) {
  return String(name || "")
    .replace(/^[\s༄✦✧◆◇❖★☆•·‧]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMentionNamesPayload(guild?, userNames?) {
  const rolesRaw = buildRoleNameMap(guild);
  const roles: Record<string, string> = {};
  for (const [id, name] of rolesRaw.entries()) {
    const key = String(id || "").trim();
    const label = cleanRoleDisplayName(name) || String(name || "").trim();
    if (key && label) roles[key] = label;
  }
  return {
    roles,
    channels: mapToRecord(buildChannelNameMap(guild)),
    users: mapToRecord(userNames || buildDefaultUserNameMap(IDs)),
  };
}

function discordGuideMarkdownToHtml(markdown?, { guild = null, userNames = null } = {}) {
  return convertGuideMarkdown(markdown, {
    IDs,
    roleNames: buildRoleNameMap(guild),
    channelNames: buildChannelNameMap(guild),
    userNames,
  });
}

/**
 * Compat frontend attuale (senza `names`): sostituisce le mention Discord
 * con etichette grassetto già leggibili, così non compare più @ruolo / #canale.
 */
function resolveMentionsInMarkdown(markdown?, guild?, userNames?) {
  const roles = buildRoleNameMap(guild);
  const channels = buildChannelNameMap(guild);
  const users = userNames || buildDefaultUserNameMap(IDs);
  const userLabel = (id?) => {
    const key = String(id || "");
    if (users && typeof users.get === "function") return String(users.get(key) || "").trim();
    if (users && typeof users === "object") return String(users[key] || "").trim();
    return "";
  };
  return String(markdown || "")
    .replace(/<@&(\d{5,32})>/g, (_m?, id?) => {
      const name = cleanRoleDisplayName(roles.get(String(id)) || "") || "Ruolo";
      return `**@${name}**`;
    })
    .replace(/<#(\d{5,32})>/g, (_m?, id?) => {
      const name = channels.get(String(id)) || "canale";
      return `**#${name}**`;
    })
    .replace(/<@!?(\d{5,32})>/g, (_m?, id?) => {
      const name = userLabel(id) || "Utente";
      return `**@${name}**`;
    });
}

async function buildIntroPayload(client?, guild?) {
  const rawMarkdown = "";
  const userNames = await resolveGuideUserNames(client, guild, rawMarkdown);
  const names = buildMentionNamesPayload(guild, userNames);
  return {
    title: "Guida staff",
    markdown: resolveMentionsInMarkdown(rawMarkdown, guild, userNames),
    markdownRaw: rawMarkdown,
    html: discordGuideMarkdownToHtml(rawMarkdown, { guild, userNames }),
    names,
  };
}

async function buildSectionPayload(client?, member?, sectionId?) {
  const meta: any = getStaffGuideSectionMeta(sectionId);
  const rawMarkdown = buildStaffGuideSectionMarkdown(sectionId);
  if (!meta || rawMarkdown == null) return null;

  const guild = member?.guild || null;
  const children = getStaffGuideChildSectionIds(sectionId)
    .filter((cid?) => memberCanReadStaffGuideSection(member, cid))
    .map((cid?) => {
      const childMeta = getStaffGuideSectionMeta(cid);
      return childMeta
        ? { id: childMeta.id, label: childMeta.label, description: childMeta.description }
        : { id: cid, label: cid, description: "" };
    });

  const userNames = await resolveGuideUserNames(client, guild, rawMarkdown);
  const names = buildMentionNamesPayload(guild, userNames);
  const payload: Record<string, any> = {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    markdown: resolveMentionsInMarkdown(rawMarkdown, guild, userNames),
    markdownRaw: rawMarkdown,
    html: discordGuideMarkdownToHtml(rawMarkdown, { guild, userNames }),
    names,
  };
  if (meta.parent) payload.parent = meta.parent;
  if (children.length) payload.children = children;
  return payload;
}

async function handleSiteStaffGuideGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const member = access.member;
    const sectionId = String(req.query?.section || "").trim();

    if (sectionId) {
      if (!listStaffGuideSectionMeta().some((s?) => s.id === sectionId)) {
        return res.status(404).json({
          ok: false,
          error: "unknown_section",
          message: "Sezione guida non trovata.",
        });
      }
      if (!memberCanReadStaffGuideSection(member, sectionId)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden_section",
          message: "Non hai i permessi per leggere questa sezione della guida.",
        });
      }
      const section = await buildSectionPayload(client, member, sectionId);
      if (!section) {
        return res.status(404).json({
          ok: false,
          error: "section_unavailable",
          message: "Sezione non disponibile.",
        });
      }
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      return res.status(200).json({ ok: true, section });
    }

    const sections = listReadableStaffGuideSections(member);
    const intro = await buildIntroPayload(client, member.guild);
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    return res.status(200).json({ ok: true, sections, intro });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-guide:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffGuideGet,
};
