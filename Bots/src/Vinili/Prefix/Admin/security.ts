const{EmbedBuilder,PermissionsBitField,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,}=require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const{ getAntiNukeStatusSnapshot, stopAntiNukePanic, setAntiNukeConfigSnapshot }=require("../../Services/Moderation/antiNukeService") as typeof import("../../Services/Moderation/antiNukeService");
const{getSecurityStaticsSnapshot,getSecurityProfilesSnapshot,}=require("../../Services/Moderation/securityProfilesService") as typeof import("../../Services/Moderation/securityProfilesService");
const{getJoinRaidStatusSnapshot,setJoinRaidConfigSnapshot,stopJoinRaidWindowForGuild,}=require("../../Services/Moderation/joinRaidService") as typeof import("../../Services/Moderation/joinRaidService");
const{getJoinGateConfigSnapshot,updateJoinGateConfig,}=require("../../Services/Moderation/joinGateService") as typeof import("../../Services/Moderation/joinGateService");
const{ getAutoModConfigSnapshot, getAutoModRulesSnapshot, getAutoModPanicSnapshot, updateAutoModConfig, clearAutoModPanicState }=require("../../Services/Moderation/automodService") as typeof import("../../Services/Moderation/automodService");
const { getSecurityLockState, invalidateSecurityLockCache } = require("../../Services/Moderation/securityOrchestratorService") as typeof import("../../Services/Moderation/securityOrchestratorService");
const { sendSecurityAuditLog } = require("../../Utils/Logging/securityAuditLog") as typeof import("../../Utils/Logging/securityAuditLog");

const STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
].filter(Boolean);

const PANIC_CONTROL_ROLE_IDS=[IDs.roles.Founder].filter(Boolean);

const PAGE_ROLES = 0;
const PAGE_CHANNELS = 1;
const PAGE_USERS = 2;
const SECURITY_MODULE_DEFS = [
  { id: "antinuke", label: "AntiNuke", hint: "Panic, quarantine, vanity guard" },
  { id: "automod", label: "AutoMod", hint: "Heat system, filtri spam, panic" },
  { id: "joingate", label: "JoinGate", hint: "Filtri ingresso (età, avatar, bot)" },
  { id: "joinraid", label: "JoinRaid", hint: "Rilevamento raid e lock comandi" },
  { id: "lockcommands", label: "Lock cmd", hint: "Blocca comandi durante panic/raid" },
];

function toTs(ms?, style = "R") {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `<t:${Math.floor(n / 1000)}:${style}>`;
}

function toCompactDuration(ms?) {
  const n = Math.max(0, Number(ms || 0));
  if (!Number.isFinite(n)) return "0m";
  const totalSec = Math.round(n / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.round(totalMin / 60);
  if (totalHr < 24) return `${totalHr}h`;
  const totalDays = Math.round(totalHr / 24);
  return `${totalDays}d`;
}

function formatActionLabel(action?, fallback = "log") {
  const raw = String(action || fallback || "log").trim().toLowerCase();
  if (!raw) return "Log";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function hasAnyRole(member?, roleIds?) {
  return roleIds.some((id?) => member?.roles?.cache?.has?.(id));
}

function hasStaffAccess(member?, guild?) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  return hasAnyRole(member, STAFF_ROLE_IDS);
}

function hasPanicControlAccess(member?, guild?) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  return hasAnyRole(member, PANIC_CONTROL_ROLE_IDS);
}

function formatRecordList(ids = [], kind = "role") {
  const arr = Array.isArray(ids) ? ids : [];
  if (!arr.length) return "`No record found.`";
  if (kind === "channel") return arr.map((id?) => `<#${id}>`).join("\n");
  if (kind === "user") return arr.map((id?) => `<@${id}>`).join("\n");
  return arr.map((id?) => `<@&${id}>`).join("\n");
}

function buildTypesLine(activePage?) {
  const roles = activePage === PAGE_ROLES ? "**[ Roles ]**" : "[Roles]";
  const channels = activePage === PAGE_CHANNELS ? "**[ Channels ]**" : "[Channels]";
  const users = activePage === PAGE_USERS ? "**[ Users ]**" : "[Users]";
  return `${roles} ${channels} ${users}`;
}

function buildSecurityStaticsPanelEmbed(guildId?, page = PAGE_ROLES) {
  const statics = getSecurityStaticsSnapshot(guildId);
  const profiles = getSecurityProfilesSnapshot(guildId);
  const mainRoles = Array.isArray(statics?.mainRoleIds) ? statics.mainRoleIds : [];
  const partneringChannels=Array.isArray(statics?.partneringChannelIds)?statics.partneringChannelIds:[];
  const trusted = Array.isArray(profiles?.trustedAdmins) ? profiles.trustedAdmins : [];
  const owners = Array.isArray(profiles?.extraOwners) ? profiles.extraOwners : [];

  if (page === PAGE_CHANNELS) {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Static Channels")
      .setDescription(
        [
          `[6]. Logging Channel (${statics.modLoggingChannelId ? "1/1" : "0/1"}):`,
          statics.modLoggingChannelId ? `<#${statics.modLoggingChannelId}>` : "`No record found.`",
          "",
          `[7]. Mod-Logging Channel (${statics.loggingChannelId ? "1/1" : "0/1"}):`,
          statics.loggingChannelId ? `<#${statics.loggingChannelId}>` : "`No record found.`",
          "",
          `[8]. Partnering Channels (${partneringChannels.length}/10):`,
          formatRecordList(partneringChannels, "channel"),
          "",
          `[9]. Main Channel (${statics.mainChannelId ? "1/1" : "0/1"}):`,
          statics.mainChannelId ? `<#${statics.mainChannelId}>` : "`No record found.`",
          "",
          `[12]. Verification Channel (${statics.verificationChannelId ? "1/1" : "0/1"}):`,
          statics.verificationChannelId ? `<#${statics.verificationChannelId}>` : "`No record found.`",
          "",
          "Statics Types:",
          buildTypesLine(PAGE_CHANNELS),
        ].join("\n"),
      );
  }

  if (page === PAGE_USERS) {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Static Members")
      .setDescription(
        [
          `[10]. Trusted Admins (${trusted.length}/5):`,
          formatRecordList(trusted, "user"),
          "",
          `[11]. Extra Owners (${owners.length}/5):`,
          formatRecordList(owners, "user"),
          "",
          "Statics Types:",
          buildTypesLine(PAGE_USERS),
        ].join("\n"),
      );
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Static Roles")
    .setDescription(
      [
        `[2]. Quarantine Role (${statics.quarantineRoleId ? "1/1" : "0/1"}):`,
        statics.quarantineRoleId ? `<@&${statics.quarantineRoleId}>` : "`No record found.`",
        "",
        `[5]. Main Role (${mainRoles.length}/10):`,
        formatRecordList(mainRoles, "role"),
        "",
        "Statics Types:",
        buildTypesLine(PAGE_ROLES),
      ].join("\n"),
    );
}

function parsePanicTarget(raw?) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  const map={antinuke:"antinuke",automod:"automod",joingate:"joingate",joinraid:"joinraid",lockcommands:"lockcommands",all:"all",};
  return map[value] || "";
}

async function buildStatusEmbeds(guild?) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const joinGate = getJoinGateConfigSnapshot();
  const autoCfg = getAutoModConfigSnapshot();
  const autoRules = getAutoModRulesSnapshot();
  const autoPanic = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);
  const antiCfg: any = anti?.config || {};
  const panicCfg = antiCfg?.panicMode || {};
  const quarantine = antiCfg?.autoQuarantine || {};
  const backup = panicCfg?.autoBackupSync || {};
  const warnedRoleIds=Array.isArray(panicCfg.warnedRoleIds)?panicCfg.warnedRoleIds.filter(Boolean):[];
  const warnedRoles=warnedRoleIds.length?warnedRoleIds.map((id?) => `<@&${id}>`).join(", ")
    : "`No record found.`";

  const raidWarnedRoleIds=Array.isArray(raid?.config?.warnedRoleIds)?raid.config.warnedRoleIds.filter(Boolean):[];
  const raidWarnedRoles=raidWarnedRoleIds.length?raidWarnedRoleIds.map((id?) => `<@&${id}>`).join(", ")
    : "<a:VC_Cross:1482532424570376253>";
  const idFlag: any = raid?.config?.idFlag || {};
  const ageFlag: any = raid?.config?.ageFlag || {};
  const noPfpFlag: any = raid?.config?.noPfpFlag || {};

  const hs = autoCfg?.heatSystem || {};
  const at = autoCfg?.autoTimeouts || {};
  const panic = autoCfg?.panic || {};
  const lock = autoCfg?.autoLockdown || {};
  const minAgeDays = Number(joinGate?.newAccounts?.minAgeDays || 3);

  const page1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Global Anti - Nuke Panel")
    .setDescription(
      [
        "[1] Status:",
        `- \`${anti?.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[2] Panic Mode:",
        "- Dal **menu +security** → voce *Panic / runtime*.",
        "",
        "[3] Backups:",
        `- [A] Status: \`${backup.enabled ? "Enabled" : "Disabled"}\``,
        "- [B] Max immagini: `10`",
        "- [C] Intervallo: `Ogni 3h`",
        "",
        "[4] Prune Detection:",
        `- \`${antiCfg?.detectPrune ? "Enabled" : "Disabled"}\``,
        "",
        "[5] Quarantine Hold:",
        `- [A] Status: \`${quarantine.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Strict Mode: \`${quarantine.strictMode ? "Enabled" : "Disabled"}\``,
        `- [C] Monitor Public Roles: \`${quarantine.monitorPublicRoles ? "Enabled" : "Disabled"}\``,
        `- [D] Vanity Protection: \`${antiCfg?.vanityGuard ? "Enabled" : "Disabled"}\``,
        `- [E] Strict Member Role Addition: \`${quarantine.strictMemberRoleAddition ? "Enabled" : "Disabled"}\``,
        "",
        "[6] Runtime:",
        `- Panic **${anti?.panicActive ? "ON" : "OFF"}**`,
        `- JoinRaid **${raid?.raidActive ? "ON" : "OFF"}**`,
        `- AutoMod Panic **${autoPanic.active ? "ON" : "OFF"}**`,
        `- JoinLock **${sec.joinLockActive ? "ON" : "OFF"}**`,
        `- CmdLock **${sec.commandLockActive ? "ON" : "OFF"}**`,
        `- Warned roles: ${warnedRoles}`,
      ].join("\n"),
    );

  const page2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Join Raid")
    .setDescription(
      [
        "[1] Status:",
        `- \`${raid?.enabled ? "Enabled" : "Disabled"}\``,
        "[2] Action:",
        `- \`${formatActionLabel(raid?.config?.triggerAction, "ban")}\``,
        "[3] Warned Roles:",
        `- ${raidWarnedRoles}`,
        "",
        "[4] Details:",
        `- [X] Lock Commands While Raid: \`${raid?.config?.lockCommands ? "Enabled" : "Disabled"}\``,
        `- [A] Minimum Trigger: \`${Number(raid?.config?.triggerCount || 10)} accounts\``,
        `- [B] Join History: Past \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
        `- [C] Trigger Duration: \`${toCompactDuration(raid?.config?.raidDurationMs || 0)}\``,
        "",
        "[5] Age Flag:",
        `- [A] Status: \`${ageFlag.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Minimum: \`${toCompactDuration(ageFlag.minimumAgeMs || 0)}\``,
        "",
        "[6] NoPFP Flag:",
        `- \`${noPfpFlag.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[7] ID Flag:",
        `- [A] Status: \`${idFlag.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Granularity: \`${String(idFlag.categorization || "adaptive")}\``,
        `- [C] Margin: \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
        `- [D] Minimum Matches: \`${Number(idFlag.minimumMatches || 4)}\``,
      ].join("\n"),
    );

  const page3 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Heat System Panel")
    .setDescription(
      [
        "[1] Status:",
        `- \`${autoRules?.status?.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[2] Spam Filters:",
        `- \`${autoRules?.status?.antiSpamEnabled ? "Enabled" : "Disabled"}\``,
        "",
        "[3] Max Heat Percentage:",
        `- \`${Number(hs.maxHeat || 100)}%\``,
        "",
        "[4] Heat Degradation:",
        `- \`${Number(hs.decayPerSec || 0)}% per second\``,
        "",
        "[5] Strikes CAP:",
        `- \`${Number(at.capStrike || 3)}\``,
        "",
        "[6] Auto Timeouts:",
        `- [A] Status: \`${at.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Regular Strike Duration: \`${toCompactDuration(at.regularStrikeDurationMs)}\``,
        `- [C] CAP Strike Duration: \`${toCompactDuration(at.capStrikeDurationMs)}\``,
        "",
        "[7] Heat Panic Mode:",
        `- [A] Status: \`${panic.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Trigger: \`${Number(panic.triggerCount || 3)} Raiders\``,
        `- [C] Panic Duration: \`${toCompactDuration(panic.durationMs)}\``,
        `- [D] Lock commands (panic): \`${panic.lockCommands ? "Enabled" : "Disabled"}\``,
        "",
        "[8] Auto Server Lockdown:",
        `- [A] Status: \`${lock.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Mentions: \`${Number(lock.mentionTrigger || 50)}\``,
        `- [C] Under: \`${toCompactDuration(lock.mentionWindowMs)}\``,
      ].join("\n"),
    );

  const page4 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("JoinGate Panel")
    .setDescription(
      [
        "[1] General:",
        `- [A] Status: \`${joinGate?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] DM Members: \`${joinGate?.dmPunishedMembers ? "Enabled" : "Disabled"}\``,
        "",
        "[2] No Avatar Filter:",
        `- [A] Status: \`${joinGate?.noAvatar?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.noAvatar?.action, "log")}\``,
        "",
        "[3] Account Age Filter:",
        `- [A] Status: \`${joinGate?.newAccounts?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.newAccounts?.action, "kick")}\``,
        `- [C] Minimum Age: \`${minAgeDays} days\``,
        "",
        "[4] Bot Addition Filter:",
        `- [A] Status: \`${joinGate?.botAdditions?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.botAdditions?.action, "kick")}\``,
        "",
        "[5] Suspicious Account Filter:",
        `- [A] Status: \`${joinGate?.suspiciousAccount?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.suspiciousAccount?.action, "log")}\``,
      ].join("\n"),
    );

  return [page1, page2, page3, page4];
}

async function buildPanicStatusEmbeds(guild?) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const auto = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);

  const panicCfg: any = anti?.config?.panicMode || {};
  const lockdown = panicCfg?.lockdown || {};
  const warnedRoleIds=Array.isArray(panicCfg?.warnedRoleIds)?panicCfg.warnedRoleIds.filter(Boolean):[];
  const whitelistCategoryIds=Array.isArray(panicCfg?.whitelistCategoryIds)?panicCfg.whitelistCategoryIds.filter(Boolean):[];
  const warnedRows=warnedRoleIds.length?warnedRoleIds.slice(0,3).map((id?) => `<@&${id}>`).join(", ")
    : "`No record found.`";
  const whitelistRows=whitelistCategoryIds.length?whitelistCategoryIds.slice(0,3).map((id?) => `<#${id}>`).join(", ")
    : "`No record found.`";

  const page1=new EmbedBuilder().setColor(panicCfg.enabled?"#6f4e37":"#57F287").setTitle("Anti - Nuke Panic Mode").setDescription(["[1] Status:",`- *${panicCfg.enabled?"Enabled":"Disabled"}*`,
        "",
        "[2] Heat Algorithm:",
        `- *${panicCfg.useHeatAlgorithm?"Enabled":"Disabled"}*`,
        "",
        "[3] Lockdown Server on trigger:",
        `- *${lockdown.dangerousRoles||lockdown.channelLockdown||lockdown.lockAllCommands?"Enabled":"Disabled"}*`,
        "",
        "[4] Unlock Server when ending:",
        `- *${lockdown.unlockDangerousRolesOnFinish?"Enabled":"Disabled"}*`,
        "",
        `[5] Warned Roles (${Math.min(warnedRoleIds.length,3)}/3):`,
        warnedRows,
        "",
        `[6] Whitelisted Categories (${Math.min(whitelistCategoryIds.length,3)}/3):`,
        whitelistRows,
        "",
        "[7] Lock Mod Cmds on trigger:",
        `- *${lockdown.lockModerationCommands?"Enabled":"Disabled"}*`,
        "",
        `Panic attiva ora: **${anti?.panicActive?"SI":"NO"}**${anti?.panicActive?` (fino a ${toTs(anti?.panicActiveUntil,"F")})` : ""}`,].join("\n"),);

  const page2=new EmbedBuilder().setColor("#6f4e37").setTitle("Panic Runtime Overview").setDescription(["[1] AutoMod Panic:",`- Enabled: **${auto?.enabled?"ON":"OFF"}**`,
        `- Active: **${auto?.active?"ON":"OFF"}**${auto?.active?` (fino a ${toTs(auto?.activeUntil,"F")})` : ""}`,
        `- Tracked Accounts: **${Number(auto?.trackedAccounts||0)}**`,
        "",
        "[2] JoinRaid Runtime:",
        `- Enabled: **${raid?.enabled?"ON":"OFF"}**`,
        `- Active: **${raid?.raidActive?"ON":"OFF"}**${raid?.raidActive?` (fino a ${toTs(raid?.raidUntil,"F")})` : ""}`,
        `- LockCommands: **${raid?.config?.lockCommands?"ON":"OFF"}**`,
        "",
        "[3] Global Locks:",
        `- Join lock active: **${sec?.joinLockActive?"ON":"OFF"}**`,
        `- Command lock active: **${sec?.commandLockActive?"ON":"OFF"}**`,
      ].join("\n"),
    );

  return [page1, page2];
}

async function disableAntiNuke(guild?, actorId?) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const wasActive = Boolean(snap?.panicActive || snap?.enabled || snap?.panicModeEnabled);
  if (!wasActive) return { ok: true, changed: false, note: "AntiNuke già spento/inattivo." };

  let panicStopped = false;
  if (snap?.panicActive) {
    const stopped = await stopAntiNukePanic(guild, "manual security panic disable", actorId).catch(() => ({ ok: false }));
    panicStopped = Boolean(stopped?.ok);
  }

  const cfg: any = snap?.config || {};
  const setResult=setAntiNukeConfigSnapshot({...cfg,enabled:false,panicMode:{...(cfg.panicMode||{}),enabled:false,lockdown:{...(cfg.panicMode?.lockdown||{}),lockModerationCommands:false,lockAllCommands:false,},},});

  return {
    ok: Boolean(setResult?.ok),
    changed: true,
    note: `AntiNuke disabilitato${panicStopped ? " + panic stoppata" : ""}.`,
  };
}

async function disableAutoMod(guildId?) {
  const cfg = getAutoModConfigSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const rules = getAutoModRulesSnapshot();
  const wasActive = Boolean(rules?.status?.enabled || cfg?.panic?.enabled || panic?.active);
  if (!wasActive) return { ok: true, changed: false, note: "AutoMod già spento/inattivo." };

  const r1 = updateAutoModConfig("enabled", false);
  const r2 = updateAutoModConfig("panic.enabled", false);
  const r3 = updateAutoModConfig("autoLockdown.enabled", false);
  const ok = Boolean(r1?.ok && r2?.ok && r3?.ok);
  if (ok) clearAutoModPanicState(guildId);
  return {
    ok,
    changed: true,
    note: ok ? "AutoMod disabilitato (panic/autolockdown OFF)." : "Errore disabilitazione AutoMod.",
  };
}

async function disableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  const wasActive = Boolean(cfg?.enabled);
  if (!wasActive) return { ok: true, changed: false, note: "JoinGate già spento." };

  const updated = updateJoinGateConfig("enabled", "false");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate disabilitato." : "Errore disabilitazione JoinGate.",
  };
}

async function disableJoinRaid(guildId?) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const wasActive = Boolean(raid?.enabled || raid?.raidActive || raid?.config?.lockCommands);
  if (!wasActive) return { ok: true, changed: false, note: "JoinRaid già spento/inattivo." };

  const next={...(raid?.config||{}),enabled:false,lockCommands:false,};
  const updated = setJoinRaidConfigSnapshot(next);
  if (updated?.ok) await stopJoinRaidWindowForGuild(guildId);
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid disabilitato (lockCommands OFF, finestra raid chiusa)." : "Errore disabilitazione JoinRaid.",
  };
}

async function disableLockCommands(guildId?) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  const wasActive = antiLockMod || antiLockAll || raidLock;
  if (!wasActive) return { ok: true, changed: false, note: "LockCommands già disattivati." };

  const antiCfg: any = anti?.config || {};
  const antiUpdated=setAntiNukeConfigSnapshot({...antiCfg,panicMode:{...(antiCfg.panicMode||{}),lockdown:{...(antiCfg.panicMode?.lockdown||{}),lockModerationCommands:false,lockAllCommands:false,},},});

  const raidUpdated=setJoinRaidConfigSnapshot({...(raid?.config||{}),lockCommands:false,});

  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands disattivati (AntiNuke + JoinRaid)." : "Errore disattivazione LockCommands.",
  };
}

async function enableAntiNuke(guild?, actorId?) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const cfg: any = snap?.config || {};

  // Arm the module + panic *capability*, but do NOT start a live panic.
  // Starting panic on enable was locking the whole server (channel lockdown)
  // and making it look like the bot "vanished" from threads/channels.
  const setResult = setAntiNukeConfigSnapshot({
    ...cfg,
    enabled: true,
    panicMode: {
      ...(cfg.panicMode || {}),
      enabled: true,
      autoBackupSync: {
        ...(cfg.panicMode?.autoBackupSync || {}),
        enabled: true,
      },
    },
  });
  if (!setResult?.ok) return { ok: false, changed: false, note: "Errore riabilitazione AntiNuke." };

  // If a leftover panic is still running from a previous arm, stop it cleanly.
  let panicStopped = false;
  if (snap?.panicActive) {
    const stopped = await stopAntiNukePanic(
      guild,
      `security enable cleanup by ${String(actorId || "unknown")}`,
      actorId,
    ).catch(() => ({ ok: false }));
    panicStopped = Boolean(stopped?.ok);
  }

  return {
    ok: true,
    changed: true,
    note: panicStopped
      ? "AntiNuke riabilitato (protezione armata, panic residua stoppata)."
      : "AntiNuke riabilitato (protezione armata, panic NON avviata).",
  };
}

async function enableAutoMod(guildId?, actorId?) {
  const cfg = getAutoModConfigSnapshot();
  const rules = getAutoModRulesSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const wasArmed = Boolean(rules?.status?.enabled && cfg?.panic?.enabled);
  if (wasArmed && !panic?.active) {
    return { ok: true, changed: false, note: "AutoMod già attivo (protezione armata)." };
  }

  const r1 = updateAutoModConfig("enabled", true);
  const r2 = updateAutoModConfig("panic.enabled", true);
  if (!r1?.ok || !r2?.ok) {
    return { ok: false, changed: false, note: "Errore riabilitazione AutoMod." };
  }

  // Do not force a live panic on enable — only arm detection.
  if (panic?.active) {
    clearAutoModPanicState(guildId);
  }

  return {
    ok: true,
    changed: true,
    note: "AutoMod riabilitato (protezione armata, panic NON avviata).",
  };
}

async function enableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  if (cfg?.enabled) return { ok: true, changed: false, note: "JoinGate già attivo." };
  const updated = updateJoinGateConfig("enabled", "true");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate riabilitato." : "Errore riabilitazione JoinGate.",
  };
}

async function enableJoinRaid(guildId?) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  if (raid?.enabled) return { ok: true, changed: false, note: "JoinRaid già attivo." };
  const updated=setJoinRaidConfigSnapshot({...(raid?.config||{}),enabled:true,lockCommands:Boolean(raid?.config?.lockCommands),});
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid riabilitato." : "Errore riabilitazione JoinRaid.",
  };
}

async function enableLockCommands(guildId?) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  if (antiLockMod && antiLockAll && raidLock) {
    return { ok: true, changed: false, note: "LockCommands già attivi." };
  }

  const antiCfg: any = anti?.config || {};
  const antiUpdated=setAntiNukeConfigSnapshot({...antiCfg,panicMode:{...(antiCfg.panicMode||{}),lockdown:{...(antiCfg.panicMode?.lockdown||{}),lockModerationCommands:true,lockAllCommands:true,},},});
  const raidUpdated=setJoinRaidConfigSnapshot({...(raid?.config||{}),lockCommands:true,});
  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands attivati (AntiNuke + JoinRaid)." : "Errore attivazione LockCommands.",
  };
}

async function runSecurityAction(action?, target?, guild?, actorId?) {
  const guildId = String(guild?.id || "");
  const results = [];

  if (action === "disable") {
    if (target === "antinuke" || target === "all") {
      results.push({ system: "AntiNuke", ...(await disableAntiNuke(guild, actorId)) });
    }
    if (target === "automod" || target === "all") {
      results.push({ system: "AutoMod", ...(await disableAutoMod(guildId)) });
    }
    if (target === "joingate" || target === "all") {
      results.push({ system: "JoinGate", ...(await disableJoinGate()) });
    }
    if (target === "joinraid" || target === "all") {
      results.push({ system: "JoinRaid", ...(await disableJoinRaid(guildId)) });
    }
    if (target === "lockcommands" || target === "all") {
      results.push({ system: "LockCommands", ...(await disableLockCommands(guildId)) });
    }
    invalidateSecurityLockCache(guildId);
    return results;
  }

  if (target === "antinuke" || target === "all") {
    results.push({ system: "AntiNuke", ...(await enableAntiNuke(guild, actorId)) });
  }
  if (target === "automod" || target === "all") {
    results.push({ system: "AutoMod", ...(await enableAutoMod(guildId, actorId)) });
  }
  if (target === "joingate" || target === "all") {
    results.push({ system: "JoinGate", ...(await enableJoinGate()) });
  }
  if (target === "joinraid" || target === "all") {
    results.push({ system: "JoinRaid", ...(await enableJoinRaid(guildId)) });
  }
  if (target === "lockcommands" || target === "all") {
    results.push({ system: "LockCommands", ...(await enableLockCommands(guildId)) });
  }
  invalidateSecurityLockCache(guildId);
  return results;
}

async function fetchSecurityModulesState(guild?) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const joinGate = getJoinGateConfigSnapshot();
  const autoRules = getAutoModRulesSnapshot();
  const autoPanic = getAutoModPanicSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  const lockCommandsEnabled = antiLockMod || antiLockAll || raidLock;
  const enabledById = {
    antinuke: Boolean(anti?.enabled),
    automod: Boolean(autoRules?.status?.enabled),
    joingate: Boolean(joinGate?.enabled),
    joinraid: Boolean(raid?.enabled),
    lockcommands: lockCommandsEnabled,
  };
  const runtimeById = {
    antinuke: anti?.panicActive ? "Panic attiva" : "",
    automod: autoPanic?.active ? "Panic attiva" : "",
    joinraid: raid?.raidActive ? "Raid attivo" : "",
  };
  return SECURITY_MODULE_DEFS.map((def?) => ({
    ...def,
    enabled: Boolean(enabledById[def.id]),
    runtime: String(runtimeById[def.id] || "").trim(),
  }));
}

async function buildSecurityModulesPanelPayload(guild?, ownerId?, member = null) {
  const modules = await fetchSecurityModulesState(guild);
  const canPanic = member && hasPanicControlAccess(member, guild);
  const activeCount = modules.filter((m?) => m.enabled).length;
  const lines = modules.map((m?) => {
    const status = m.enabled
      ? "<:VC_OnlineStatus:1482527088912240650> Attivo"
      : "<:VC_OfflineStatus:1482527117051957380> Disattivo";
    const runtime = m.runtime ? ` · *${m.runtime}*` : "";
    return `<:VC_Dot:1482532364222595303> **${m.label}**: ${status}${runtime}\n> ${m.hint}`;
  });
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Lock:1482526739044368476> Moduli sicurezza")
    .setDescription(
      [
        "<:VC_PinkQuestionMark:1471892611026391306> Clicca un **pulsante modulo** per attivarlo o disattivarlo **subito**.",
        "",
        `<:VC_Info:1482526956703580372> **Stato attuale** (${activeCount}/${modules.length} attivi):`,
        "",
        ...lines,
        "",
        canPanic
          ? "<a:VC_Alert:1482706673176150077> **Disabilita tutto** / **Abilita tutto** agiscono su tutti i moduli elencati."
          : "<:VC_InactiveStatus:1482526984234860574> Solo **Founder** può modificare i moduli.",
      ].join("\n"),
    );
  const iconUrl = guild?.iconURL?.({ size: 256, extension: "png" });
  if (iconUrl) embed.setThumbnail(iconUrl);
  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`security_panel:back:${ownerId}`)
      .setEmoji("<:VC_page2:1482459724657201387>")
      .setLabel("Indietro")
      .setStyle(ButtonStyle.Primary),
  );
  if (!canPanic) {
    return { embeds: [embed], components: [rowBack] };
  }
  const toggleButtons = modules.map((m?) =>
    new ButtonBuilder()
      .setCustomId(`security_panel:toggle:${ownerId}:${m.id}`)
      .setLabel(m.label)
      .setStyle(m.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(m.enabled ? "<:VC_OnlineStatus:1482527088912240650>" : "<:VC_OfflineStatus:1482527117051957380>"),
  );
  const rowModules = new ActionRowBuilder().addComponents(...toggleButtons);
  const allOn = modules.every((m?) => m.enabled);
  const allOff = modules.every((m?) => !m.enabled);
  const rowBulk = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`security_panel:bulk:${ownerId}:disable_all`)
      .setLabel("Disabilita tutto")
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(allOff ? ButtonStyle.Secondary : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`security_panel:bulk:${ownerId}:enable_all`)
      .setLabel("Abilita tutto")
      .setEmoji("<:success:1461731530333229226>")
      .setStyle(allOn ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [rowModules, rowBulk, rowBack] };
}

function buildSecurityHubPayload(guild?, ownerId?, openerUser = null, member = null) {
  const safeOwner = String(ownerId || "").trim();
  const welcome = openerUser
    ? String(openerUser.globalName || openerUser.username || "").trim() || "Staff"
    : "Staff";
  const canPanic = member && hasPanicControlAccess(member, guild);
  const lines = [
    "<:VC_Info:1482526956703580372> **Pannello sicurezza** — stato globale, statistiche e panic.",
    "",
    "- **Stato sistemi**: AntiNuke, JoinRaid, AutoMod (heat), JoinGate",
    "- **Statics**: ruoli, canali e utenti di configurazione",
    "- **Panic / runtime**: overview panic e lock attivi",
  ];
  if (canPanic) {
    lines.push("", "<:VC_Modifica:1478859646587633717> **Founder**: attiva/disattiva i moduli dal menu **Moduli**.");
  } else {
    lines.push("", "<:VC_InactiveStatus:1482526984234860574> Modifica moduli: solo Founder.");
  }
  lines.push("", "<:VC_Modifica:1478859646587633717> Seleziona un'azione dal menu qui sotto.");
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Benvenuto, ${welcome}.`)
    .setDescription(lines.join("\n"));
  const iconUrl = guild?.iconURL?.({ size: 256, extension: "png" });
  if (iconUrl) embed.setThumbnail(iconUrl);
  const options = [
    {
      label: "Stato sistemi",
      description: "Pannello paginato (4 pagine)",
      value: "view_status",
      emoji: "<:VC_Stats:1482527532682055780>",
    },
    {
      label: "Statics",
      description: "Ruoli, canali, utenti statici",
      value: "view_statics",
      emoji: "<a:VC_Channel:1482534583944871996>",
    },
    {
      label: "Panic / runtime",
      description: "Stato panic e lock",
      value: "view_panic",
      emoji: "<a:VC_Alert:1482706673176150077>",
    },
  ];
  if (canPanic) {
    options.push({
      label: "Moduli",
      description: "Attiva/disattiva moduli con un click",
      value: "view_modules",
      emoji: "<:VC_Lock:1482526739044368476>",
    });
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`security_panel:hub:${safeOwner}`)
      .setPlaceholder("Scegli un'area…")
      .addOptions(options),
  );
  return { embeds: [embed], components: [row] };
}

export = {
  name: "security",
  subcommands: [],
  subcommandAliases: {},
  subcommandsDescriptions: {},
  allowEmptyArgs: true,

  buildSecurityHubPayload,
  buildSecurityModulesPanelPayload,
  fetchSecurityModulesState,
  buildStatusEmbeds,
  buildPanicStatusEmbeds,
  buildSecurityStaticsPanelEmbed,
  hasStaffAccess,
  hasPanicControlAccess,
  runSecurityAction,
  parsePanicTarget,
  sendSecurityAuditLog,

  async execute(message?, args = []) {
    if (!message?.guild || !message?.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (args.length > 0) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Security")
            .setDescription(
              "<:vegax:1443934876440068179> Usa solo **`+security`** senza argomenti. Si apre il **pannello** (menu: stato, statistiche, panic; Founder può attivare/disattivare i moduli con un click).",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const payload = buildSecurityHubPayload(
      message.guild,
      message.author.id,
      message.author,
      message.member,
    );
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};