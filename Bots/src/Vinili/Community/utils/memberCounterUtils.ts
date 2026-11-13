const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const COUNTER_PREFIX = "༄☕︲Members: ";
const primaryTimers = new Map();
const secondaryTimers = new Map();

function buildCounterName(count?) {
  const safeCount = Math.max(0, Number(count || 0));
  return `${COUNTER_PREFIX}${safeCount}`;
}

async function resolveCounterChannel(guild?) {
  if (!guild) return null;
  const channelId = IDs.channels.countUtenti;
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

async function resolveReliableMemberCount(guild?) {
  if (!guild) return 0;
  let count = Number(guild.memberCount || 0);
  const freshGuild = await guild.fetch().catch(() => null);
  if (freshGuild && Number.isFinite(Number(freshGuild.memberCount))) {
    count = Number(freshGuild.memberCount);
  }
  if (!Number.isFinite(count) || count < 0) {
    count = Math.max(0, Number(guild.members?.cache?.size || 0));
  }
  return count;
}

const T = () => require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");

/**
 * Contatore importato nella dashboard (Contatori): undefined = non ancora importato (testo classico),
 * null = eliminato dalla dashboard (non si aggiorna più), altrimenti la riga con il testo scelto lì.
 */
async function dashboardCounter(guildId?, channelId?) {
  try {
    if (!(await T().wasPanelImported(String(guildId), "memberCounter", false))) return undefined;
    const rows = await T().listRows("counters", String(guildId));
    return rows.find((r?) => r?.channelId === String(channelId)) || null;
  } catch (_) {
    return undefined;
  }
}

async function updateMemberCounterNow(guild?) {
  if (!guild) return false;
  if (!(require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches")).isModuleOn(guild.id, "contatori")) return false;
  const channel = await resolveCounterChannel(guild);
  if (!channel) return false;

  const row = await dashboardCounter(guild.id, channel.id);
  /* eliminato o cambiato tipo dalla dashboard: ci pensa lo scheduler della dashboard (o nessuno) */
  if (row === null || (row && row.type !== "members")) return false;

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return false;

  const count = await resolveReliableMemberCount(guild);
  const nextName = row ? T().counterDisplayName(row, { members: count }) : buildCounterName(count);
  if (String(channel.name || "") === nextName) return true;

  await channel.setName(nextName).catch(() => {});
  if (row) {
    /* lo scheduler della dashboard sa che il nome è già giusto: niente rinomina doppia */
    try {
      const rows = await T().listRows("counters", guild.id, true);
      await T().writeRows("counters", guild.id, rows.map((r?) => (r.id === row.id ? { ...r, lastName: nextName } : r)));
    } catch (_) {}
  }
  return true;
}

function clearTimers(guildId?) {
  const first = primaryTimers.get(guildId);
  if (first) clearTimeout(first);
  primaryTimers.delete(guildId);

  const second = secondaryTimers.get(guildId);
  if (second) clearTimeout(second);
  secondaryTimers.delete(guildId);
}

function scheduleMemberCounterRefresh(guild?, options: Record<string, any> = {}) {
  if (!guild?.id) return false;
  const guildId = guild.id;
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));
  const secondPassMs = Math.max(0, Number(options.secondPassMs ?? 1800));

  clearTimers(guildId);

  const primary = setTimeout(async () => {
    await updateMemberCounterNow(guild).catch(() => {});
    if (secondPassMs > 0) {
      const secondary = setTimeout(async () => {
        await updateMemberCounterNow(guild).catch(() => {});
        secondaryTimers.delete(guildId);
      }, secondPassMs);
      secondary.unref?.();
      secondaryTimers.set(guildId, secondary);
    }
    primaryTimers.delete(guildId);
  }, delayMs);
  primary.unref?.();
  primaryTimers.set(guildId, primary);
  return true;
}

export = { updateMemberCounterNow, scheduleMemberCounterRefresh };
