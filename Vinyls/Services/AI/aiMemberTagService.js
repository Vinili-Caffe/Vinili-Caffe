const IDs = require("../../Utils/Config/ids");
const { MEMBER_TAG_RE } = require("./aiQuickReplies");
const { listMembersWithRole } = require("./aiGuildContextService");

const ROLE_LOOKUP = [
  { keys: ["founder", "fondatore", "fondatori", "dev", "developer"], roleIds: [IDs.roles.Founder], label: "Founder" },
  { keys: ["manager"], roleIds: [IDs.roles.Manager], label: "Manager" },
  { keys: ["admin", "amministratore", "amministratori"], roleIds: [IDs.roles.Admin], label: "Admin" },
  { keys: ["director", "direttore"], roleIds: [IDs.roles.Director], label: "Director" },
  { keys: ["senior moderator", "senior mod", "seniormod"], roleIds: [IDs.roles.SeniorModerator], label: "Senior Moderator" },
  { keys: ["moderatore", "moderatori", "moderator"], roleIds: [IDs.roles.Mod], label: "Moderatore" },
  { keys: ["helper"], roleIds: [IDs.roles.Helper], label: "Helper" },
  { keys: ["high staff", "highstaff"], roleIds: [IDs.roles.HighStaff], label: "High Staff" },
  { keys: ["partner manager", "partnermanager"], roleIds: [IDs.roles.PartnerManager], label: "Partner Manager" },
  { keys: ["staff", "staffer"], roleIds: [IDs.roles.Staff], label: "Staff" },
  { keys: ["mod"], roleIds: [IDs.roles.Mod], label: "Moderatore" },
];

const ROLE_KEYWORDS = new Set(
  ROLE_LOOKUP.flatMap((entry) => entry.keys.map((k) => k.toLowerCase().replace(/\s+/g, " "))),
);

function detectRoleHint(question) {
  const q = String(question || "").toLowerCase();
  const ordered = [...ROLE_LOOKUP].sort((a, b) => {
    const al = Math.max(...a.keys.map((k) => k.length));
    const bl = Math.max(...b.keys.map((k) => k.length));
    return bl - al;
  });
  for (const entry of ordered) {
    for (const key of entry.keys) {
      const re = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(q)) return entry;
    }
  }
  return null;
}

function extractTaggedName(question) {
  const patterns = [
    /\b(?:chiamat[oa]|nome|nickname|utente|membro)\s+(?:di\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9._-]{1,31})\b/i,
    /\b(?:tagg(?:a|are|ami|o)|menzion(?:a|are|ami|o)|ping(?:a|are|ami|o))\s+(?:l['']?)?(?:utente\s+|il\s+|la\s+|lo\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9._-]{1,31})\b/i,
  ];
  for (const re of patterns) {
    const m = String(question || "").match(re);
    const name = String(m?.[1] || "").trim();
    if (!name) continue;
    if (ROLE_KEYWORDS.has(name.toLowerCase())) continue;
    return name;
  }
  return "";
}

function memberDisplayToken(member) {
  return String(
    member?.displayName || member?.user?.globalName || member?.user?.username || "",
  ).toLowerCase();
}

function matchesNameToken(member, token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return false;
  const username = String(member?.user?.username || "").toLowerCase();
  const globalName = String(member?.user?.globalName || "").toLowerCase();
  const displayName = memberDisplayToken(member);
  return username === t || globalName === t || displayName === t || displayName.includes(t);
}

async function resolveUserIdByName(guild, raw) {
  if (!guild || !raw) return null;
  const token = String(raw || "").trim();
  if (!token) return null;

  const fromCache = guild.members.cache.find((member) => matchesNameToken(member, token));
  if (fromCache?.id) return String(fromCache.id);

  const fetchedChunk = await guild.members.fetch({ query: token, limit: 20 }).catch(() => null);
  if (fetchedChunk?.size) {
    const exact = fetchedChunk.find((member) => matchesNameToken(member, token));
    if (exact?.id) return String(exact.id);
    const first = fetchedChunk.first();
    if (first?.id) return String(first.id);
  }

  const searched = await guild.members.search({ query: token, limit: 20 }).catch(() => null);
  if (searched?.size) {
    const exact = searched.find((member) => matchesNameToken(member, token));
    if (exact?.id) return String(exact.id);
    const first = searched.first();
    if (first?.id) return String(first.id);
  }
  return null;
}

function buildRoleTagReply(members, label) {
  const picks = members.slice(0, 5);
  if (!picks.length) {
    return {
      text: `Non trovo membri con il ruolo ${label} in questo momento. Controlla la staff list o la lista membri di Discord.`,
      mentionUserIds: [],
    };
  }
  const tags = picks.map((m) => `<@${m.id}>`).join(" ");
  const intro =
    picks.length === 1
      ? label === "Admin" || label === "Founder"
        ? `Ecco il nostro ${label}:`
        : `Ecco ${label}:`
      : `Ecco ${label} del server:`;
  return {
    text: `${intro} ${tags}`,
    mentionUserIds: picks.map((m) => String(m.id)),
  };
}

async function resolveMemberTagReply({ guild, question }) {
  const q = String(question || "").trim();
  if (!q || !MEMBER_TAG_RE.test(q) || !guild) return null;

  const roleHint = detectRoleHint(q);
  if (roleHint) {
    const members = [];
    const seen = new Set();
    for (const roleId of roleHint.roleIds) {
      const chunk = await listMembersWithRole(guild, roleId);
      for (const member of chunk) {
        const id = String(member.id);
        if (seen.has(id)) continue;
        seen.add(id);
        members.push(member);
      }
    }
    return buildRoleTagReply(members, roleHint.label);
  }

  const name = extractTaggedName(q);
  if (name) {
    const userId = await resolveUserIdByName(guild, name);
    if (userId) {
      return {
        text: `Ecco <@${userId}>:`,
        mentionUserIds: [userId],
      };
    }
    return {
      text: `Non trovo un membro chiamato **${name}**. Prova con il nickname esatto o cerca nella lista membri.`,
      mentionUserIds: [],
    };
  }

  return null;
}

module.exports = {
  detectRoleHint,
  extractTaggedName,
  resolveMemberTagReply,
};