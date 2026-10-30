const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { sanitizeDiscordChannelName } = require("../Utils/Discord/discordDisplayName") as typeof import("../Utils/Discord/discordDisplayName");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  listReadableStaffGuideSections,
  memberCanReadStaffGuideSection,
} = require("../Utils/Staff/staffGuideAccess") as typeof import("../Utils/Staff/staffGuideAccess");
const {
  buildStaffGuideIntroMarkdown,
  buildStaffGuideSectionMarkdown,
  getStaffGuideSectionMeta,
  getStaffGuideChildSectionIds,
  listStaffGuideSectionMeta,
} = require("../Utils/Staff/staffGuideContent") as typeof import("../Utils/Staff/staffGuideContent");
const {
  discordGuideMarkdownToHtml: convertGuideMarkdown,
  buildDefaultUserNameMap,
  buildDefaultRoleNameMap,
  buildDefaultChannelNameMap,
  humanizeIdKey,
} = require("./discordGuideMarkdown") as typeof import("./discordGuideMarkdown");

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

function discordGuideMarkdownToHtml(markdown?, { guild = null, userNames = null } = {}) {
  return convertGuideMarkdown(markdown, {
    IDs,
    roleNames: buildRoleNameMap(guild),
    channelNames: buildChannelNameMap(guild),
    userNames,
  });
}

async function buildIntroPayload(client?, guild?) {
  const markdown = buildStaffGuideIntroMarkdown();
  const userNames = await resolveGuideUserNames(client, guild, markdown);
  return {
    title: "Guida staff",
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild, userNames }),
  };
}

async function buildSectionPayload(client?, member?, sectionId?) {
  const meta: any = getStaffGuideSectionMeta(sectionId);
  const markdown = buildStaffGuideSectionMarkdown(sectionId);
  if (!meta || markdown == null) return null;

  const guild = member?.guild || null;
  const children = getStaffGuideChildSectionIds(sectionId)
    .filter((cid?) => memberCanReadStaffGuideSection(member, cid))
    .map((cid?) => {
      const childMeta = getStaffGuideSectionMeta(cid);
      return childMeta
        ? { id: childMeta.id, label: childMeta.label, description: childMeta.description }
        : { id: cid, label: cid, description: "" };
    });

  const userNames = await resolveGuideUserNames(client, guild, markdown);
  const payload: Record<string, any> = {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild, userNames }),
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
  discordGuideMarkdownToHtml,
};
