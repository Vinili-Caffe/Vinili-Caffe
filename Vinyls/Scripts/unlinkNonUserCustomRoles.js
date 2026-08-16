/**
 * Clear profile.customRole slots that are NOT user-created custom roles
 * (must include ༄ / ✦ / ★; never managed / hogwarts).
 *
 * Usage: node Vinyls/Scripts/unlinkNonUserCustomRoles.js [--apply]
 */
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");
const { MongoClient } = require("mongodb");
const IDs = require("../Utils/Config/ids");
const {
  looksLikeUserCustomRoleName,
  collectBlockedSystemRoleIds,
  isListableUserCustomRole,
} = require("../Utils/Community/userCustomRoleFilter");

function loadEnv() {
  const file = ["/opt/bot/.env", path.resolve(__dirname, "../../.env")].find((p) => fs.existsSync(p));
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
const gid = String(IDs.guilds?.main || "1329080093599076474");
const BLOCKED = collectBlockedSystemRoleIds();

(async () => {
  const client = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds] });
  await client.login(env.DISCORD_TOKEN || env.DISCORD_TOKEN_OFFICIAL);
  const guild = await client.guilds.fetch(gid);
  await guild.roles.fetch();
  const mongo = new MongoClient(env.MONGO_URL_LOCAL);
  await mongo.connect();
  const col = mongo.db("test").collection("activityuserprofiles");
  const docs = await col
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

  const report = [];
  for (const doc of docs) {
    const userId = String(doc.userId || "");
    let primary = String(doc.profile?.customRole?.roleId || "").trim() || null;
    let secondary = String(doc.profile?.customRole?.secondaryRoleId || "").trim() || null;
    const before = { roleId: primary, secondaryRoleId: secondary };
    const keepIfCustom = (rid) => {
      if (!rid) return null;
      const role = guild.roles.cache.get(rid);
      if (!role) return null;
      if (!isListableUserCustomRole(role, { blockedRoleIds: BLOCKED })) return null;
      return rid;
    };
    primary = keepIfCustom(primary);
    secondary = keepIfCustom(secondary);
    if (primary === before.roleId && secondary === before.secondaryRoleId) continue;
    report.push({
      userId,
      before,
      after: { roleId: primary, secondaryRoleId: secondary },
      clearedNames: [
        before.roleId && before.roleId !== primary ? guild.roles.cache.get(before.roleId)?.name || before.roleId : null,
        before.secondaryRoleId && before.secondaryRoleId !== secondary
          ? guild.roles.cache.get(before.secondaryRoleId)?.name || before.secondaryRoleId
          : null,
      ].filter(Boolean),
    });
    if (APPLY) {
      await col.updateOne(
        { guildId: gid, userId },
        {
          $set: {
            "profile.customRole.roleId": primary,
            "profile.customRole.secondaryRoleId": secondary,
          },
        },
      );
    }
  }

  console.log(JSON.stringify({ apply: APPLY, fixed: report.length, report }, null, 2));
  await mongo.close();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
