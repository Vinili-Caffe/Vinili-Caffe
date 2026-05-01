const path = require("path");
const configPath = path.join(__dirname, "..", "..", "config.json");
let config = {};
try {
  config = require(configPath);
} catch (err) {
  global.logger?.warn?.("[ids] config load:", err?.message || err);
}

const MAIN_GUILD_ID = config.mainGuildId || process.env.MAIN_GUILD_ID || "1329080093599076474";
const GUILD_TEST_ID = "1462458562507964584";
const ch = config.channels || {};

function parseSnowflakeIdList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || "").trim()).filter((x) => /^\d{5,30}$/.test(x));
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((x) => /^\d{5,30}$/.test(x));
  }
  return [];
}

const stanzaDiscoveryExcludeParentIds = parseSnowflakeIdList(config.stanzaDiscoveryExcludeParentIds);

const IDs = {
  guilds: {
    main: MAIN_GUILD_ID,
    test: GUILD_TEST_ID,
  },
  channels: {
    ticketLogs: ch.ticketLogs || "1442569290682208296",
    verifyLog: ch.verifyLog || null,
    verifyPing: ch.verifyPing || null,
    errorLogChannel: ch.errorLogChannel || "1466489404867481802",
    serverBotLogs: ch.serverBotLogs || "1472733599496409292",
    commands: ch.commands || "1442569138114662490",
    staffCmds: ch.staffCmds || null,
    chat: ch.chat || config.chatReminder?.channelId || "1442569130573303898",
    ticket: ch.ticket || "1442569095068254219",
    counting: ch.counting || "1442569179743125554",
    info: ch.info || "1442569111119990887",
    candidatureStaff: ch.candidatureStaff || "1442569232507473951",
    stanzaLobbyVoice: ch.stanzaLobbyVoice || "1499754530076626964",
    vocaleLounge1: ch.vocaleLounge1 || "1442569101225496819",
    vocaleLounge2: ch.vocaleLounge2 || "1442569106514645042",
    vocaleLounge3: ch.vocaleLounge3 || "1470168983507435631",
    noMic: ch.noMic || "1442569187376763010",
  },
  roles: {
    Member: (config.roles && config.roles.Member) || "1442568949605597264",
    HighStaff: (config.roles && config.roles.HighStaff) || "1442568894349840435",
    Founder: (config.roles && config.roles.Founder) || "1442568886988963923",
  },
  /** Categorie (ID) in cui non cercare stanze (es. vocali private custom). Vedi `stanzaDiscoveryExcludeParentIds` in config.json */
  stanzaDiscoveryExcludeParentIds,
};

module.exports = IDs;