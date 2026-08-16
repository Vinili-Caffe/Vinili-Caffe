/**
 * Re-link orphan Discord custom roles → profile.customRole when Mongo IDs were wiped.
 * Starts from Discord roles (fast), not from every empty Mongo profile.
 *
 * Usage:
 *   node Vinyls/Scripts/relinkOrphanCustomRoles.js [--apply] [userId]
 */
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");
const { MongoClient } = require("mongodb");

const root = path.resolve(__dirname, "..");
const IDs = require(path.join(root, "Utils/Config/ids"));
const { collectHogwartsSystemRoleIds } = require(path.join(root, "Utils/Web/hogwartsSortingConfig"));

function loadEnv() {
  const candidates = [
    path.resolve(root, "../.env"),
    path.resolve("/opt/bot/.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error("missing .env");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const APPLY = process.argv.includes("--apply");
const ONLY_USER = process.argv.find((a) => /^\d{17,22}$/.test(a)) || null;
const gid = String(IDs.guilds?.main || IDs.mainGuildId || "1329080093599076474");

const fixedRoleIds = new Set(collectHogwartsSystemRoleIds(null));
for (const v of Object.values(IDs.roles || {})) {
  if (typeof v === "string" && /^\d{17,22}$/.test(v)) fixedRoleIds.add(v);
}
for (const v of Object.values(IDs.channels || {})) {
  // channel snowflakes must never be treated as claimable custom roles
  if (typeof v === "string" && /^\d{17,22}$/.test(v)) fixedRoleIds.add(v);
}

function looksLikeCustomRoleName(name) {
  const n = String(name || "");
  return n.includes("༄") || n.startsWith("✦") || n.startsWith("★");
}

function isEmptySlot(v) {
  return v == null || v === "";
}

(async () => {
  const token = env.DISCORD_TOKEN || env.DISCORD_TOKEN_OFFICIAL;
  const mongoUri = env.MONGO_URL_LOCAL;
  if (!token || !mongoUri) throw new Error("missing token/mongo");

  const client = new Discord.Client({
    intents: [Discord.GatewayIntentBits.Guilds, Discord.GatewayIntentBits.GuildMembers],
  });
  await client.login(token);
  const guild = await client.guilds.fetch(gid);
  await guild.roles.fetch();
  await guild.members.fetch();

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db();
  const col = db.collection("activityuserprofiles");

  const claimed = new Map();
  const owners = await col
    .find(
      {
        guildId: gid,
        $or: [
          { "profile.customRole.roleId": { $type: "string" } },
          { "profile.customRole.secondaryRoleId": { $type: "string" } },
        ],
      },
      { projection: { userId: 1, "profile.customRole.roleId": 1, "profile.customRole.secondaryRoleId": 1 } },
    )
    .toArray();
  for (const d of owners) {
    const a = d?.profile?.customRole?.roleId;
    const b = d?.profile?.customRole?.secondaryRoleId;
    if (a && !isEmptySlot(a)) claimed.set(String(a), String(d.userId));
    if (b && !isEmptySlot(b)) claimed.set(String(b), String(d.userId));
  }

  /** userId → [{id,name,position}] unclaimed custom-looking roles on the member */
  const byUser = new Map();
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id || role.managed || fixedRoleIds.has(role.id)) continue;
    if (!looksLikeCustomRoleName(role.name)) continue;
    if (claimed.has(role.id)) continue;
    for (const member of role.members.values()) {
      const userId = member.id;
      if (ONLY_USER && userId !== ONLY_USER) continue;
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId).push({ id: role.id, name: role.name, position: role.position, tag: member.user.tag });
    }
  }

  const report = [];
  for (const [userId, roles] of byUser) {
    roles.sort((a, b) => b.position - a.position);
    const profile = await col.findOne(
      { guildId: gid, userId },
      { projection: { "profile.customRole.roleId": 1, "profile.customRole.secondaryRoleId": 1 } },
    );
    const curPrimary = profile?.profile?.customRole?.roleId;
    const curSecondary = profile?.profile?.customRole?.secondaryRoleId;
    // Only fill empty slots — never overwrite existing links
    if (!isEmptySlot(curPrimary) && !isEmptySlot(curSecondary)) continue;
    if (!isEmptySlot(curPrimary) && roles.length === 0) continue;

    let primaryId = !isEmptySlot(curPrimary) ? String(curPrimary) : null;
    let secondaryId = !isEmptySlot(curSecondary) ? String(curSecondary) : null;
    const available = roles.filter((r) => r.id !== primaryId && r.id !== secondaryId);

    if (!primaryId && available.length) {
      primaryId = available.shift().id;
    }
    if (!secondaryId && available.length) {
      secondaryId = available.shift().id;
    }
    if (!primaryId && !secondaryId) continue;
    if (primaryId === curPrimary && secondaryId === (curSecondary || null)) continue;

    const primaryRole = guild.roles.cache.get(primaryId);
    const secondaryRole = secondaryId ? guild.roles.cache.get(secondaryId) : null;
    const patch = {
      "profile.customRole.roleId": primaryId,
      "profile.customRole.secondaryRoleId": secondaryId,
      "profile.customRole.expiresAt": null,
      "profile.customRole.customRoleEligibilityLostAt": null,
    };
    report.push({
      userId,
      tag: roles[0]?.tag || userId,
      primary: primaryRole ? { id: primaryRole.id, name: primaryRole.name } : { id: primaryId },
      secondary: secondaryRole ? { id: secondaryRole.id, name: secondaryRole.name } : null,
      hadPrimary: !isEmptySlot(curPrimary),
      hadSecondary: !isEmptySlot(curSecondary),
    });
    if (APPLY) {
      await col.updateOne(
        { guildId: gid, userId },
        { $set: patch, $setOnInsert: { guildId: gid, userId } },
        { upsert: true },
      );
      if (primaryId) claimed.set(primaryId, userId);
      if (secondaryId) claimed.set(secondaryId, userId);
    }
  }

  console.log(JSON.stringify({ apply: APPLY, fixed: report.length, report }, null, 2));
  await mongo.close();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
