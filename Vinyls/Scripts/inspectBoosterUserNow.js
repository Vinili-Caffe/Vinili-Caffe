/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const p of ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
    break;
  }
}

async function main() {
  loadEnv();
  const uid = String(process.argv[2] || "1299283148751765525").trim();
  const mongoose = require("mongoose");
  await mongoose.connect(
    process.env.MONGO_URL_LOCAL ||
      process.env.MONGO_URI_LOCAL ||
      process.env.MONGO_URL ||
      process.env.MONGODB_URI,
  );

  const { ActivityUserProfile, UserLeaveBackup } = require("../Schemas/Community/communitySchemas");
  const IDs = require("../Utils/Config/ids");
  const { getAnnouncedBoostSlots, ensureBoostSlotsSynced } = require("../Utils/Community/boostSlotAnnounceTracker");
  const extras = require("../Events/guildMemberUpdate");
  const gid = String(IDs.guilds.main);

  const prof = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean();
  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean();

  const { Client, GatewayIntentBits } = require("discord.js");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  await client.login(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL);
  await new Promise((r) => client.once("ready", r));

  const guild = await client.guilds.fetch(gid);
  const member = await guild.members.fetch(uid).catch(() => null);
  const ch = await guild.channels.fetch(String(IDs.channels.supporters || "")).catch(() => null);

  await ensureBoostSlotsSynced(gid, uid).catch(() => null);
  const memSlots = getAnnouncedBoostSlots(gid, uid);
  const sinceMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const nativeSlots = ch
    ? await extras.countNativeBoostSlotsInRecentMessages(guild, ch, uid, { sinceMs, perChannelLimit: 100 }).catch(() => 0)
    : 0;
  const embedCount = ch
    ? await extras.countRecentBotBoostAnnouncesForUser(ch, uid, { sinceMs, limit: 100 }).catch(() => 0)
    : 0;

  const boosterIds = [IDs.roles.ServerBooster, IDs.roles.DoubleBooster].map(String);
  const backupBoosterRoles = (backup?.restoreRoleIds || []).filter((id) => boosterIds.includes(String(id)));

  console.log(
    JSON.stringify(
      {
        userId: uid,
        inGuild: Boolean(member),
        username: member?.user?.username || null,
        joinedAt: member?.joinedAt?.toISOString?.() || null,
        premiumSince: member?.premiumSince || null,
        premiumSinceTs: member?.premiumSinceTimestamp || null,
        hasServerBooster: member ? member.roles.cache.has(IDs.roles.ServerBooster) : null,
        hasDoubleBooster: member ? member.roles.cache.has(IDs.roles.DoubleBooster) : null,
        guildPremiumCount: guild.premiumSubscriptionCount ?? null,
        guildPremiumTier: guild.premiumTier ?? null,
        roleNames: member
          ? [...member.roles.cache.values()]
              .filter((r) => r.id !== gid && !r.managed)
              .map((r) => r.name)
              .sort()
          : [],
        dbSlots: prof?.profile?.serverBoostAnnouncedSlotCount ?? null,
        memSlots,
        nativeSlots7d: nativeSlots,
        botEmbedCount7d: embedCount,
        leaveBackup: {
          exists: Boolean(backup),
          leftAt: backup?.leftAt || null,
          expiresAt: backup?.expiresAt || null,
          boosterRolesInBackup: backupBoosterRoles,
          restoreRoleCount: backup?.restoreRoleIds?.length || 0,
        },
        recentSupportersHits: ch
          ? [...(await ch.messages.fetch({ limit: 120 }).catch(() => new Map())).values()]
              .filter((msg) => {
                const blob = `${msg.content || ""} ${msg.embeds?.[0]?.description || ""}`;
                return blob.includes(uid) || msg.mentions?.users?.has?.(uid) || msg.author?.id === uid;
              })
              .slice(0, 6)
              .map((msg) => ({
                at: new Date(msg.createdTimestamp).toISOString(),
                type: msg.type,
                authorId: msg.author?.id || null,
                content: String(msg.content || "").slice(0, 140),
              }))
          : [],
      },
      null,
      2,
    ),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
