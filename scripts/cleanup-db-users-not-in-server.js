/**
 * Rimuove dal DB tutti i documenti relativi a utenti che non sono più nel server principale.
 * Usa la Discord REST API per ottenere la lista membri (no Gateway Intents).
 * Eseguire con: node scripts/cleanup-db-users-not-in-server.js
 * Richiede .env: DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL), MONGO_URL.
 * Opzionale: GUILD_ID per sovrascrivere il server (default: IDs.guilds.main).
 * Opzionale: --dry-run per solo contare i documenti da rimuovere senza eliminarli.
 */
const path = require("path");
const dryRun = process.argv.includes("--dry-run");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

async function fetchAllGuildMemberIds(guildId, token) {
  const memberIds = new Set();
  let after = "0";
  const limit = 1000;
  const baseUrl = `https://discord.com/api/v10/guilds/${guildId}/members`;
  while (true) {
    const url = `${baseUrl}?limit=${limit}&after=${after}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Discord API ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const m of data) {
      const id = m.user?.id;
      if (id) memberIds.add(id);
    }
    if (data.length < limit) break;
    after = data[data.length - 1].user?.id || "0";
    if (!after) break;
  }
  return Array.from(memberIds);
}

async function run() {
  if (!DISCORD_TOKEN) {
    console.error("Imposta DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL) in .env");
    process.exit(1);
  }
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL in .env");
    process.exit(1);
  }

  const IDs = require("../Vinyls/Utils/Config/ids");
  const mainGuildId = process.env.GUILD_ID || IDs.guilds?.main || "1329080093599076474";
  console.log("[cleanup] Recupero lista membri del server:", mainGuildId);
  const memberIds = await fetchAllGuildMemberIds(mainGuildId, DISCORD_TOKEN);
  console.log("[cleanup] Membri attuali:", memberIds.length);

  await mongoose.connect(MONGO_URL);
  const {
    ExpUser,
    ActivityUser,
    ActivityDaily,
    ActivityHourly,
    LevelHistoryUser,
    VoteRole,
    VerificationTenure,
    InviteReminderState,
    ActivityEventReward,
    EventUserExpSnapshot,
    EventWeekWinner,
    StaffEventPoints,
    StaffEventWeeklyReward,
    StaffEventRewardGiven,
    CustomRole,
    AvatarPrivacy,
    BannerPrivacy,
    QuotePrivacy,
    InviteTrack,
    BirthdayProfile,
    NoDmPreference,
  } = require("../Vinyls/Schemas/Community/communitySchemas");
  const { MinigameUser } = require("../Vinyls/Schemas/Minigames/minigameSchema");
  const AFK = require("../Vinyls/Schemas/Afk/afkSchema");
  const { MentionReaction } = require("../Vinyls/Schemas/Community/autoInteractionSchemas");
  const RolePersist = require("../Vinyls/Schemas/Moderation/rolePersistSchema");
  const TemporaryRoleGrant = require("../Vinyls/Schemas/Moderation/temporaryRoleGrantSchema");
  const TemporaryCommandPermission = require("../Vinyls/Schemas/Moderation/temporaryCommandPermissionSchema");
  const SupporterStatus = require("../Vinyls/Schemas/Supporter/supporterStatusSchema");
  const VoiceDisconnectCounter = require("../Vinyls/Schemas/Voice/voiceDisconnectCounterSchema");
  const Staff = require("../Vinyls/Schemas/Staff/staffSchema");
  const SuspiciousAccount = require("../Vinyls/Schemas/Moderation/suspiciousAccountSchema");
  const BumpVoteReward = require("../Vinyls/Schemas/Bump/bumpVoteRewardSchema");
  const { DiscadiaVoter } = require("../Vinyls/Schemas/Discadia/discadiaSchemas");
  const OneTimeReminder = require("../Vinyls/Schemas/Reminders/oneTimeReminderSchema");
  const AutoModBadUser = require("../Vinyls/Schemas/Moderation/autoModBadUserSchema");

  const guildScoped = [
    [ExpUser, "ExpUser"],
    [ActivityUser, "ActivityUser"],
    [ActivityDaily, "ActivityDaily"],
    [ActivityHourly, "ActivityHourly"],
    [LevelHistoryUser, "LevelHistoryUser"],
    [MinigameUser, "MinigameUser"],
    [AFK, "AFK"],
    [MentionReaction, "MentionReaction"],
    [RolePersist, "RolePersist"],
    [TemporaryRoleGrant, "TemporaryRoleGrant"],
    [TemporaryCommandPermission, "TemporaryCommandPermission"],
    [SupporterStatus, "SupporterStatus"],
    [VoiceDisconnectCounter, "VoiceDisconnectCounter"],
    [Staff, "Staff"],
    [SuspiciousAccount, "SuspiciousAccount"],
    [BirthdayProfile, "BirthdayProfile"],
    [NoDmPreference, "NoDmPreference"],
    [BumpVoteReward, "BumpVoteReward"],
    [DiscadiaVoter, "DiscadiaVoter"],
    [VoteRole, "VoteRole"],
    [VerificationTenure, "VerificationTenure"],
    [InviteReminderState, "InviteReminderState"],
    [ActivityEventReward, "ActivityEventReward"],
    [EventUserExpSnapshot, "EventUserExpSnapshot"],
    [EventWeekWinner, "EventWeekWinner"],
    [StaffEventPoints, "StaffEventPoints"],
    [StaffEventWeeklyReward, "StaffEventWeeklyReward"],
    [StaffEventRewardGiven, "StaffEventRewardGiven"],
    [CustomRole, "CustomRole"],
    [AvatarPrivacy, "AvatarPrivacy"],
    [BannerPrivacy, "BannerPrivacy"],
    [QuotePrivacy, "QuotePrivacy"],
    [InviteTrack, "InviteTrack"],
  ];
  const userScoped = [
    [OneTimeReminder, "OneTimeReminder"],
    [AutoModBadUser, "AutoModBadUser"],
  ];

  const filterGuild = { guildId: mainGuildId, userId: { $nin: memberIds } };
  const filterUser = { userId: { $nin: memberIds } };
  let totalDeleted = 0;

  if (dryRun) console.log("[cleanup] Modalità --dry-run: nessuna eliminazione.\n");

  for (const [Model, name] of guildScoped) {
    const n = dryRun
      ? await Model.countDocuments(filterGuild).catch(() => 0)
      : (await Model.deleteMany(filterGuild).catch((e) => ({ deletedCount: 0, error: e })))?.deletedCount ?? 0;
    if (n > 0) console.log(`[cleanup] ${name}: ${dryRun ? "da rimuovere" : "rimossi"} ${n}`);
    totalDeleted += n;
  }
  for (const [Model, name] of userScoped) {
    const n = dryRun
      ? await Model.countDocuments(filterUser).catch(() => 0)
      : (await Model.deleteMany(filterUser).catch((e) => ({ deletedCount: 0, error: e })))?.deletedCount ?? 0;
    if (n > 0) console.log(`[cleanup] ${name}: ${dryRun ? "da rimuovere" : "rimossi"} ${n}`);
    totalDeleted += n;
  }

  console.log("[cleanup] Totale documenti " + (dryRun ? "da rimuovere" : "rimossi") + ":", totalDeleted);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});