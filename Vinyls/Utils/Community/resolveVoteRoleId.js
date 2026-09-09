const IDs = require("../Config/ids");
const path = require("path");
const fs = require("fs");

// Cache per guild, evita di fare fetch roles ad ogni singolo evento.
const voteRoleIdByGuild = new Map();
let roleIdRemapForward = null;

function loadRoleIdRemapForward() {
  if (roleIdRemapForward) return roleIdRemapForward;
  try {
    const fp = path.join(__dirname, "../../Data/roleIdRemap.emergency.json");
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    roleIdRemapForward =
      raw?.idRemap && typeof raw.idRemap === "object" ? raw.idRemap : {};
  } catch (_) {
    roleIdRemapForward = {};
  }
  return roleIdRemapForward;
}

function normalizeId(raw) {
  const s = String(raw || "").trim();
  return /^\d{16,22}$/.test(s) ? s : "";
}

function remapRoleId(roleId) {
  const id = normalizeId(roleId);
  if (!id) return "";
  const mapped = normalizeId(loadRoleIdRemapForward()[id]);
  return mapped || id;
}

async function tryFetchRoleById(guild, roleId) {
  if (!guild || !roleId) return null;
  const cached = guild.roles?.cache?.get?.(roleId);
  if (cached) return cached;
  return guild.roles?.fetch?.(roleId).catch(() => null) ?? null;
}

async function resolveByName(guild) {
  if (!guild) return null;
  const rolesCollection = await guild.roles.fetch().catch(() => null);
  const roles =
    rolesCollection ||
    // Fallback: se non abbiamo fetch permessi, usiamo la cache parziale.
    guild.roles?.cache;
  if (!roles) return null;

  // Il nome attuale dovrebbe essere "༄ Voter", ma cerchiamo in modo permissivo.
  const role =
    roles.find?.((r) => /voter/i.test(String(r?.name || ""))) ||
    roles.find?.((r) => /voto/i.test(String(r?.name || ""))) ||
    null;

  return role?.id ? String(role.id) : null;
}

async function resolveVoteRoleIdForGuild(guild) {
  const guildId = String(guild?.id || "");
  if (!guildId) return remapRoleId(IDs?.roles?.Voter);

  const cached = normalizeId(voteRoleIdByGuild.get(guildId));
  if (cached) {
    const stillThere = await tryFetchRoleById(guild, cached);
    if (stillThere?.id) return cached;
    voteRoleIdByGuild.delete(guildId);
  }

  const candidateId = remapRoleId(IDs?.roles?.Voter);
  if (candidateId) {
    const candidateRole = await tryFetchRoleById(guild, candidateId);
    if (candidateRole?.id) {
      voteRoleIdByGuild.set(guildId, candidateId);
      return candidateId;
    }
  }

  const resolvedId = await resolveByName(guild);
  const finalId = normalizeId(resolvedId) || "";
  voteRoleIdByGuild.set(guildId, finalId);
  return finalId;
}

module.exports = {
  resolveVoteRoleIdForGuild,
  // esportato per test/debug rapidi (non parte del contratto pubblico)
  _internal: { voteRoleIdByGuild, normalizeId, resolveByName, tryFetchRoleById, remapRoleId },
};
