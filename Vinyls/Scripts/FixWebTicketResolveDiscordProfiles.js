#!/usr/bin/env node
"use strict";
const fs = require("fs");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Utils/Config/ids");

function norm(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase();
}

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN);
  const guildId = "1329080093599076474";
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  console.log("fetching members…");
  await guild.members.fetch();
  console.log("members", guild.members.cache.size);

  const byUser = new Map();
  for (const m of guild.members.cache.values()) {
    const u = norm(m.user?.username);
    if (u) byUser.set(u, m);
  }

  const communityPriority = [
    { id: String(IDs.roles?.VIPplus || ""), name: "VIP+", key: "vip-plus" },
    { id: String(IDs.roles?.VIP || ""), name: "VIP", key: "vip" },
    { id: String(IDs.roles?.DoubleBooster || ""), name: "Double Booster", key: "double-booster" },
    { id: String(IDs.roles?.ServerBooster || ""), name: "Booster", key: "booster" },
    { id: String(IDs.roles?.Donator || ""), name: "Donator", key: "donator" },
    { id: String(IDs.roles?.Member || ""), name: "Member", key: "member" },
  ].filter((r) => r.id);

  const staffRoleIds = [
    IDs.roles?.Founder,
    IDs.roles?.Manager,
    IDs.roles?.Admin,
    IDs.roles?.Director,
    IDs.roles?.HighStaff,
    IDs.roles?.SeniorModerator,
    IDs.roles?.Mod,
    IDs.roles?.Helper,
    IDs.roles?.PartnerManager,
    IDs.roles?.CommunityManager,
    IDs.roles?.Staff,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  function communityRole(member) {
    for (const row of communityPriority) {
      if (member.roles.cache.has(row.id)) return row;
    }
    return null;
  }
  function isStaffMember(member) {
    return staffRoleIds.some((id) => member.roles.cache.has(id));
  }

  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const msgs = mongoose.connection.db.collection("sitewebticketmessages");
  const tickets = mongoose.connection.db.collection("sitewebtickets");

  const slugs = await msgs.distinct("authorId", { guildId, authorId: { $regex: /^discord:/ } });
  let resolved = 0;
  let updated = 0;
  let addedUsersPatched = 0;

  for (const authorId of slugs) {
    const hint = norm(String(authorId).slice(8));
    const member = byUser.get(hint);
    if (!member) continue;
    resolved += 1;
    const staff = isStaffMember(member);
    const community = communityRole(member);
    let av = "";
    try {
      av = member.displayAvatarURL({ size: 128, extension: "png" });
    } catch {
      av = "";
    }
    const set = {
      authorId: String(member.id),
      authorAvatarUrl: av,
      authorKind: staff ? "staff" : "user",
      authorRoleName: staff ? "" : community?.name || "",
      authorRoleKey: staff ? "" : community?.key || "",
      authorRoleId: staff ? null : community?.id || null,
    };
    const r = await msgs.updateMany({ guildId, authorId }, { $set: set });
    updated += r.modifiedCount;

    // Solo clienti (non staff) → addedUsers
    if (staff) continue;

    const ticketIds = await msgs.distinct("ticketId", { guildId, authorId: String(member.id) });
    for (const tid of ticketIds) {
      const t = await tickets.findOne({ _id: tid }, { projection: { userId: 1, addedUsers: 1 } });
      if (!t || String(t.userId) === String(member.id)) continue;
      const added = Array.isArray(t.addedUsers) ? t.addedUsers : [];
      if (added.some((u) => String(u?.id) === String(member.id))) continue;
      await tickets.updateOne(
        { _id: tid },
        {
          $push: {
            addedUsers: {
              id: String(member.id),
              name: String(member.displayName || member.user?.username || hint).slice(0, 80),
              avatarUrl: av,
            },
          },
        },
      );
      addedUsersPatched += 1;
    }
  }

  // verify simba on 1350
  const t1350 = await tickets.findOne({ ticketNumber: 1350 }, { projection: { addedUsers: 1 } });
  const simba = await msgs
    .find({ ticketId: t1350?._id, authorName: /simba08062/i })
    .project({ authorId: 1, authorAvatarUrl: 1, authorRoleName: 1, authorKind: 1 })
    .limit(3)
    .toArray();

  console.log(
    JSON.stringify({ slugs: slugs.length, resolved, updated, addedUsersPatched, simba, addedUsers: t1350?.addedUsers }, null, 2),
  );
  await mongoose.disconnect();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
