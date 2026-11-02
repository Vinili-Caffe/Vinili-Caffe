const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isTicketCategoryName, isChannelInTicketCategory, isTicketChannelName } = require("../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../MultiGuild/tickets/discord/ticketCategoryUtils");
const {
  collectDiscordAutomodExemptChannelIds,
  getAutomodExemptCategoryIds,
  isAutomodExemptChannel,
} = require("../utils/automodChannelExemptions") as typeof import("../utils/automodChannelExemptions");

const MAX_EXEMPT_CHANNELS = 50;
/** Channel IDs Discord AutoMod rejected (CHANNEL_TYPE_INVALID / no longer exists). */
const REJECTED_EXEMPT_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/automodRejectedExemptChannels.json",
);
const rejectedExemptChannelIds = new Set();
const pruneLogOnce = new Set();

function loadRejectedExemptChannelIds() {
  try {
    if (!fs.existsSync(REJECTED_EXEMPT_PATH)) return;
    const parsed = JSON.parse(fs.readFileSync(REJECTED_EXEMPT_PATH, "utf8"));
    const list = Array.isArray(parsed?.ids) ? parsed.ids : Array.isArray(parsed) ? parsed : [];
    for (const raw of list) {
      const id = String(raw || "").trim();
      if (/^\d{16,22}$/.test(id)) rejectedExemptChannelIds.add(id);
    }
  } catch (_) {}
}

function persistRejectedExemptChannelIds() {
  try {
    const ids = [...rejectedExemptChannelIds].sort();
    if (ids.length > 400) ids.splice(0, ids.length - 400);
    fs.writeFileSync(
      REJECTED_EXEMPT_PATH,
      `${JSON.stringify({ ids, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  } catch (_) {}
}

loadRejectedExemptChannelIds();

function logAutomodPruneOnce(key?, ...args) {
  const k = String(key || "").slice(0, 160);
  if (!k || pruneLogOnce.has(k)) return;
  pruneLogOnce.add(k);
  if (pruneLogOnce.size > 200) {
    const first = pruneLogOnce.values().next().value;
    pruneLogOnce.delete(first);
  }
  global.logger?.debug?.(...args);
}

function collectExemptEntityIds(collectionOrArray?) {
  const out = [];
  if (!collectionOrArray) return out;
  if (typeof collectionOrArray.keys === "function") {
    for (const key of collectionOrArray.keys()) {
      const id = String(key || "").trim();
      if (/^\d{16,20}$/.test(id)) out.push(id);
    }
    return out;
  }
  const values = Array.isArray(collectionOrArray) ? collectionOrArray : [];
  for (const entry of values) {
    if (entry == null) continue;
    const id = entry?.id ?? entry;
    const key = String(id || "").trim();
    if (/^\d{16,20}$/.test(key)) out.push(key);
  }
  return out;
}

/* Discord AutoMod: text/announcement/category/forum — voice/stage restano invalidi */
const AUTOMOD_EXEMPTABLE_CHANNEL_TYPES = new Set(
  [
    ChannelType.GuildText,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ].filter((t?) => t != null),
);

function isDiscordAutomodExemptableChannel(channel?) {
  if (!channel) return false;
  if (typeof channel.isThread === "function" && channel.isThread()) return false;
  const t = Number(channel.type);
  if (!Number.isFinite(t)) return false;
  return AUTOMOD_EXEMPTABLE_CHANNEL_TYPES.has(t);
}

function isInvalidAutomodExemptChannelError(err?) {
  const msg = String(err?.message || err || "");
  if (/INVALID_AUTO_MODERATION_CHANNEL_IN_EXEMPTIONS/i.test(msg)) return true;
  if (/CHANNEL_TYPE_INVALID/i.test(msg) && /exempt/i.test(msg)) return true;
  if (/exempt_channels/i.test(msg) && /no longer exists/i.test(msg)) return true;
  const details = err?.rawError?.errors || err?.rawError?.errors?.exempt_channels;
  if (
    details &&
    /INVALID_AUTO_MODERATION_CHANNEL_IN_EXEMPTIONS|CHANNEL_TYPE_INVALID|no longer exists/i.test(
      JSON.stringify(details),
    )
  ) {
    return true;
  }
  return false;
}

function rememberRejectedExemptChannels(ids?) {
  let added = 0;
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || "").trim();
    if (!/^\d{16,22}$/.test(id)) continue;
    if (rejectedExemptChannelIds.has(id)) continue;
    rejectedExemptChannelIds.add(id);
    added += 1;
  }
  if (added) persistRejectedExemptChannelIds();
}

function extractInvalidExemptChannelIdsFromError(err?, attemptedIds?) {
  const attempted = (Array.isArray(attemptedIds) ? attemptedIds : []).map(String);
  const bad = new Set();
  const root =
    err?.rawError?.errors?.exempt_channels ||
    err?.rawError?.errors?.exemptChannels ||
    null;
  if (root && typeof root === "object") {
    for (const key of Object.keys(root)) {
      if (!/^\d+$/.test(key)) continue;
      const idx = Number(key);
      if (Number.isFinite(idx) && attempted[idx]) bad.add(String(attempted[idx]));
    }
  }
  return [...bad];
}

async function applyAutomodRuleWithExemptRepair(mutate?, body?, ruleLabel = "") {
  let channels = [...(body.exemptChannels || [])]
    .map(String)
    .filter((id?) => id && !rejectedExemptChannelIds.has(id));
  let lastErr = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await mutate({ ...body, exemptChannels: channels });
    } catch (err) {
      lastErr = err;
      if (!isInvalidAutomodExemptChannelError(err) || !channels.length) throw err;

      let bad = extractInvalidExemptChannelIdsFromError(err, channels);
      if (!bad.length && channels.length > 1) {
        /* Discord didn't point at indices: probe first half vs second half. */
        const mid = Math.ceil(channels.length / 2);
        const head = channels.slice(0, mid);
        const tail = channels.slice(mid);
        try {
          await mutate({ ...body, exemptChannels: head });
          /* head ok → invalid IDs are in tail; keep head and continue pruning tail */
          channels = head;
          const repairedTail = [];
          for (const id of tail) {
            if (rejectedExemptChannelIds.has(id)) continue;
            try {
              await mutate({ ...body, exemptChannels: [...channels, ...repairedTail, id] });
              repairedTail.push(id);
            } catch (oneErr) {
              if (!isInvalidAutomodExemptChannelError(oneErr)) throw oneErr;
              rememberRejectedExemptChannels([id]);
            }
          }
          if (repairedTail.length !== tail.length) {
            logAutomodPruneOnce(
              `pruned:${ruleLabel || body?.name || "?"}`,
              "[discordAutomod] pruned exempt_channels for",
              ruleLabel || body?.name || "?",
              `dropped=${tail.length - repairedTail.length}`,
              `kept=${channels.length + repairedTail.length}`,
            );
          }
          return mutate({ ...body, exemptChannels: [...channels, ...repairedTail] });
        } catch (headErr) {
          if (!isInvalidAutomodExemptChannelError(headErr)) throw headErr;
          bad = extractInvalidExemptChannelIdsFromError(headErr, head);
          if (!bad.length) {
            /* entire problem in head (or both): drop tail from this pass and shrink */
            channels = head;
            continue;
          }
        }
      }

      if (!bad.length && channels.length === 1) {
        rememberRejectedExemptChannels(channels);
        logAutomodPruneOnce(
          `drop1:${channels[0]}`,
          "[discordAutomod] permanent drop exempt channel",
          ruleLabel || body?.name || "?",
          channels[0],
        );
        channels = [];
        continue;
      }

      if (!bad.length) {
        /* last resort: walk one-by-one */
        const accepted = [];
        for (const id of channels) {
          if (rejectedExemptChannelIds.has(id)) continue;
          try {
            await mutate({ ...body, exemptChannels: [...accepted, id] });
            accepted.push(id);
          } catch (oneErr) {
            if (!isInvalidAutomodExemptChannelError(oneErr)) throw oneErr;
            rememberRejectedExemptChannels([id]);
          }
        }
        logAutomodPruneOnce(
          `rebuild:${ruleLabel || body?.name || "?"}`,
          "[discordAutomod] rebuilt exempt_channels for",
          ruleLabel || body?.name || "?",
          `kept=${accepted.length}/${channels.length}`,
        );
        if (accepted.length) return mutate({ ...body, exemptChannels: accepted });
        return mutate({
          ...body,
          exemptChannels: [],
          reason: `${body.reason || "Vinili AutoMod sync"} (cleared stale exempts)`,
        });
      }

      rememberRejectedExemptChannels(bad);
      const drop = new Set(bad);
      channels = channels.filter((id?) => !drop.has(id));
      logAutomodPruneOnce(
        `drop:${[...drop].sort().join(",")}`,
        "[discordAutomod] drop invalid exempt_channels for",
        ruleLabel || body?.name || "?",
        [...drop].join(","),
        `remaining=${channels.length}`,
      );
    }
  }
  throw lastErr || new Error("automod_exempt_repair_failed");
}

function filterGuildSnowflakeIds(guild?, ids?, kind = "channel") {
  const cache = kind === "role" ? guild?.roles?.cache : guild?.channels?.cache;
  if (!cache) return [];
  return (Array.isArray(ids) ? ids : [])
    .map((id?) => String(id || "").trim())
    .filter((id?) => {
      if (kind === "channel" && rejectedExemptChannelIds.has(id)) return false;
      if (!cache.has(id)) return false;
      if (kind !== "channel") return true;
      return isDiscordAutomodExemptableChannel(cache.get(id));
    });
}

function collectExemptRoleIds(guild?) {
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  if (!staffRoleId || !guild?.roles?.cache?.has(staffRoleId)) return [];
  return [staffRoleId];
}

function collectTicketAutomodExemptChannelIds(guild?) {
  const ids = new Set();
  if (!guild?.channels?.cache) return ids;
  for (const channel of guild.channels.cache.values()) {
    if (!isDiscordAutomodExemptableChannel(channel)) continue;
    if (channel.type === ChannelType.GuildCategory && isTicketCategoryName(channel.name)) {
      ids.add(String(channel.id));
    }
  }
  for (const channel of guild.channels.cache.values()) {
    if (!isDiscordAutomodExemptableChannel(channel)) continue;
    if (channel.type === ChannelType.GuildCategory) continue;
    if (isChannelInTicketCategory(channel) || isTicketChannelName(channel.name)) {
      ids.add(String(channel.id));
    }
  }
  return ids;
}

function isStaffAutomodExemptChannel(channel?, staffChatId?, staffCmdsId?) {
  if (!channel) return false;
  const id = String(channel.id || "");
  if (staffChatId && id === staffChatId) return true;
  if (staffCmdsId && id === staffCmdsId) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (staffChatId && parent === staffChatId) return true;
    if (staffCmdsId && parent === staffCmdsId) return true;
  }
  return false;
}

function collectStaffAutomodExemptChannelIds(guild?) {
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const ids = new Set();
  if (staffChatId && guild?.channels?.cache?.has(staffChatId)) ids.add(staffChatId);
  if (staffCmdsId && guild?.channels?.cache?.has(staffCmdsId)) ids.add(staffCmdsId);
  if (!guild?.channels?.cache) return [...ids];
  for (const channel of guild.channels.cache.values()) {
    // AutoMod API rejects thread IDs in exempt_channels ("no longer exists").
    if (typeof channel.isThread === "function" && channel.isThread()) continue;
    if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) {
      ids.add(String(channel.id));
    }
  }
  return [...ids];
}

function prioritizeAutomodExemptChannelIds(guild?, ids?) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id?) => /^\d{16,20}$/.test(id)))];
  const existing = filterGuildSnowflakeIds(guild, unique, "channel");
  if (existing.length <= MAX_EXEMPT_CHANNELS) return existing;
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const staffZone = [];
  const automodZones = [];
  const ticketCategories = [];
  const ticketChannels = [];
  const automodCategorySet = guild ? getAutomodExemptCategoryIds(guild) : new Set();
  for (const id of existing) {
    const channel = guild.channels.cache.get(id);
    if (automodCategorySet.has(id)) {
      automodZones.push(id);
      continue;
    }
    if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) {
      staffZone.push(id);
      continue;
    }
    if (channel && isAutomodExemptChannel(channel, guild, guild?.client)) {
      automodZones.push(id);
      continue;
    }
    if (channel.type === ChannelType.GuildCategory && isTicketCategoryName(channel.name)) {
      ticketCategories.push(id);
      continue;
    }
    if (isChannelInTicketCategory(channel) || isTicketChannelName(channel.name)) {
      ticketChannels.push(id);
    }
  }
  const out = [];
  const push = (list?) => {
    for (const id of list) {
      if (out.length >= MAX_EXEMPT_CHANNELS) return;
      out.push(id);
    }
  };
  push(staffZone);
  push(automodZones);
  push(ticketCategories);
  push(ticketChannels);
  logAutomodPruneOnce(
    `trim:${existing.length}->${out.length}`,
    `[discordAutomod] exempt channels trimmed ${existing.length} -> ${out.length}`,
  );
  return out;
}

function collectExemptChannelIds(guild?, options: Record<string, any> = {}) {
  if (!guild?.channels?.cache) return [];
  const includeTickets = options.includeTickets !== false;
  const ids = [
    ...(includeTickets ? collectTicketAutomodExemptChannelIds(guild) : []),
    ...collectStaffAutomodExemptChannelIds(guild),
    ...collectDiscordAutomodExemptChannelIds(guild, guild?.client),
  ];
  return prioritizeAutomodExemptChannelIds(guild, ids);
}

function isHateSpeechAutomodRuleName(name?) {
  const n = String(name || "");
  return n.includes("custom-words") || n.includes("slurs-preset");
}

function resolveExemptChannelsForSpec(guild?, spec?) {
  /* ticketHateOnly1: hate/slur rules still apply in ticket categories; all other native rules exempt tickets */
  if (isHateSpeechAutomodRuleName(spec?.name)) {
    return collectExemptChannelIds(guild, { includeTickets: false });
  }
  return collectExemptChannelIds(guild, { includeTickets: true });
}

function shouldResyncAutomodForChannel(channel?) {
  if (!channel?.guild) return false;
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) return true;
  if (isAutomodExemptChannel(channel, channel.guild, channel.client)) return true;
  const automodCategorySet = getAutomodExemptCategoryIds(channel.guild);
  if (automodCategorySet.has(String(channel.id || ""))) return true;
  if (channel.type === ChannelType.GuildCategory) return isTicketCategoryName(channel.name);
  return isChannelInTicketCategory(channel) || isTicketChannelName(channel.name);
}

export = {
  applyAutomodRuleWithExemptRepair,
  filterGuildSnowflakeIds,
  collectExemptRoleIds,
  collectExemptEntityIds,
  resolveExemptChannelsForSpec,
  shouldResyncAutomodForChannel,
};
