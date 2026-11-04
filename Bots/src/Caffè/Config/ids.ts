/**
 * Registry server ufficiale (shared/ids/officialGuildIds). Overlay Caffè da config.json
 * per stanza discovery / category se presenti.
 */
const path = require("path") as typeof import("path");
const baseIds: any = require("../../shared/ids/officialGuildIds") as typeof import("../../shared/ids/officialGuildIds");

let config: Record<string, any> = {};
try {
  config = require(path.join(__dirname, "..", "config.json"));
} catch (err) {
  global.logger?.warn?.("[ids] config load:", err?.message || err);
}

function parseSnowflakeIdList(raw?) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x?) => String(x || "").trim()).filter((x?) => /^\d{5,30}$/.test(x));
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map((s?) => s.trim())
      .filter((x?) => /^\d{5,30}$/.test(x));
  }
  return [];
}

const stanzaDiscoveryExcludeParentIds = parseSnowflakeIdList(config.stanzaDiscoveryExcludeParentIds);
const STANZA_CATEGORY_ID = String(
  config.stanzaCategoryId || baseIds?.categories?.categoryPublics || "",
).trim();

const IDs = {
  ...baseIds,
  guilds: {
    ...(baseIds.guilds || {}),
    main: config.mainGuildId || process.env.MAIN_GUILD_ID || baseIds.guilds?.main,
    test: baseIds.guilds?.test || "1462458562507964584",
  },
  channels: {
    ...(baseIds.channels || {}),
    ...(config.channels && typeof config.channels === "object" ? config.channels : {}),
  },
  roles: {
    ...(baseIds.roles || {}),
    ...(config.roles && typeof config.roles === "object" ? config.roles : {}),
  },
  categories: {
    ...(baseIds.categories || {}),
    ...(STANZA_CATEGORY_ID ? { categoryPublics: STANZA_CATEGORY_ID } : {}),
  },
  stanzaDiscoveryExcludeParentIds:
    stanzaDiscoveryExcludeParentIds.length > 0
      ? stanzaDiscoveryExcludeParentIds
      : Array.isArray(baseIds.stanzaDiscoveryExcludeParentIds)
        ? baseIds.stanzaDiscoveryExcludeParentIds
        : [],
};

export = IDs;
