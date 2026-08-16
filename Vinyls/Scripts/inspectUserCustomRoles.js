const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");
const { MongoClient } = require("mongodb");
const IDs = require(path.join(__dirname, "../Utils/Config/ids"));

const env = Object.fromEntries(
  fs
    .readFileSync("/opt/bot/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const token = env.DISCORD_TOKEN || env.DISCORD_TOKEN_OFFICIAL;
const gid = "1329080093599076474";
const uid = process.argv[2] || "1225217441483980811";

const fixedRoleIds = new Set();
for (const v of Object.values(IDs.roles || {})) {
  if (typeof v === "string" && /^\d{17,22}$/.test(v)) fixedRoleIds.add(v);
}

(async () => {
  const client = new Discord.Client({
    intents: [Discord.GatewayIntentBits.Guilds, Discord.GatewayIntentBits.GuildMembers],
  });
  await client.login(token);
  const guild = await client.guilds.fetch(gid);
  await guild.roles.fetch();
  const member = await guild.members.fetch(uid);

  const mongo = new MongoClient(env.MONGO_URL_LOCAL);
  await mongo.connect();
  const db = mongo.db();
  const claimed = new Map();
  const docs = await db
    .collection("activityuserprofiles")
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
  for (const d of docs) {
    const a = d?.profile?.customRole?.roleId;
    const b = d?.profile?.customRole?.secondaryRoleId;
    if (a) claimed.set(String(a), String(d.userId));
    if (b) claimed.set(String(b), String(d.userId));
  }

  const candidates = [...member.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed && !fixedRoleIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      color: r.hexColor,
      claimedBy: claimed.get(r.id) || null,
      memberCount: r.members?.cache?.size ?? null,
    }))
    .sort((a, b) => b.position - a.position);

  console.log(
    JSON.stringify(
      {
        tag: member.user.tag,
        candidates,
        all: [...member.roles.cache.values()]
          .filter((r) => r.id !== guild.id)
          .map((r) => ({ id: r.id, name: r.name, managed: r.managed, fixed: fixedRoleIds.has(r.id) })),
      },
      null,
      2,
    ),
  );

  await mongo.close();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
