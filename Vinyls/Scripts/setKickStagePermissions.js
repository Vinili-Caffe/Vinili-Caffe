#!/usr/bin/env node
"use strict";

/**
 * Imposta i permessi del palco Kick live (stage):
 * - Member / @everyone: niente View/Connect
 * - KickSub: View + Connect + chat + RequestToSpeak (alzare la mano)
 * - KickModerator: View + Connect + Move/Mute + Stream (video) + chat + RequestToSpeak
 * - @everyone / Member: niente View/Connect; RequestToSpeak consentito (per chi entra via altri ruoli)
 * - Streamer: tutti i permessi canale (ManageChannels + voice/stage full)
 */
const fs = require("fs");
const path = require("path");

for (const p of ["/opt/bot/.env", path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../../../.env")]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  OverwriteType,
  ChannelType,
} = require("discord.js");

const STAGE_ID = "1540424077255123096";
const MEMBER_ROLE_ID = "1442568949605597264";
const KICK_SUB_ROLE_ID = "1539781035360002089";
const MOD_ROLE_ID = "1540420675313860618";
const STREAMER_USER_ID = "610531025470095390";
const DRY = process.argv.includes("--dry-run");

async function main() {
  const vinylsRoot = path.resolve(__dirname, "..");
  const botRoot = path.resolve(vinylsRoot, "..");
  process.chdir(botRoot);
  const config = require(path.join(vinylsRoot, "config.json"));
  const IDs = require(path.join(vinylsRoot, "Utils", "Config", "ids"));

  const token =
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.DISCORD_TOKEN ||
    config.token;
  if (!token) throw new Error("Token Discord mancante");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const guildId = String(IDs?.guilds?.main || config?.mainGuildId || "").trim();
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  const channel =
    guild.channels.cache.get(STAGE_ID) ||
    (await guild.channels.fetch(STAGE_ID).catch(() => null));
  if (!channel) throw new Error(`Canale ${STAGE_ID} non trovato`);

  console.log("channel", channel.id, channel.name, "type", channel.type, ChannelType[channel.type]);

  const resolveLabel = async (id) => {
    const role = guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
    if (role) return `role:${role.name}`;
    const mem = await guild.members.fetch(id).catch(() => null);
    if (mem) return `user:${mem.user.tag}`;
    return "unknown";
  };

  console.log("Member", await resolveLabel(MEMBER_ROLE_ID));
  console.log("KickSub", await resolveLabel(KICK_SUB_ROLE_ID));
  console.log("ModRole", await resolveLabel(MOD_ROLE_ID));
  console.log("Streamer", await resolveLabel(STREAMER_USER_ID));

  console.log("--- before ---");
  for (const o of channel.permissionOverwrites.cache.values()) {
    console.log(
      JSON.stringify({
        id: o.id,
        type: o.type,
        allow: o.allow.toArray(),
        deny: o.deny.toArray(),
      }),
    );
  }

  const streamerAllow = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak,
    PermissionsBitField.Flags.Stream,
    PermissionsBitField.Flags.UseVAD,
    PermissionsBitField.Flags.PrioritySpeaker,
    PermissionsBitField.Flags.RequestToSpeak,
    PermissionsBitField.Flags.MuteMembers,
    PermissionsBitField.Flags.DeafenMembers,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageEvents,
    PermissionsBitField.Flags.CreateEvents,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.AddReactions,
    PermissionsBitField.Flags.UseExternalEmojis,
    PermissionsBitField.Flags.UseExternalStickers,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.MentionEveryone,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ManageThreads,
    PermissionsBitField.Flags.CreatePublicThreads,
    PermissionsBitField.Flags.CreatePrivateThreads,
    PermissionsBitField.Flags.SendMessagesInThreads,
    PermissionsBitField.Flags.UseApplicationCommands,
    PermissionsBitField.Flags.UseEmbeddedActivities,
    PermissionsBitField.Flags.UseSoundboard,
    PermissionsBitField.Flags.UseExternalSounds,
    PermissionsBitField.Flags.SetVoiceChannelStatus,
  ].filter((f) => typeof f === "bigint" || typeof f === "number");

  const botAllow = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.MuteMembers,
    PermissionsBitField.Flags.SetVoiceChannelStatus,
  ].filter((f) => typeof f === "bigint" || typeof f === "number");

  const chatAllow = [
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.AddReactions,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.UseExternalEmojis,
    PermissionsBitField.Flags.UseExternalStickers,
    PermissionsBitField.Flags.UseApplicationCommands,
  ].filter((f) => typeof f === "bigint" || typeof f === "number");

  const handRaiseAllow = [PermissionsBitField.Flags.RequestToSpeak].filter(
    (f) => typeof f === "bigint" || typeof f === "number",
  );

  const edits = [
    {
      id: MEMBER_ROLE_ID,
      type: OverwriteType.Role,
      allow: [...handRaiseAllow],
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
      reason: "Kick palco: Member senza view/connect, può alzare la mano se entra",
    },
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [...handRaiseAllow],
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
      reason: "Kick palco: @everyone senza view/connect, RequestToSpeak ok",
    },
    {
      id: KICK_SUB_ROLE_ID,
      type: OverwriteType.Role,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        ...chatAllow,
        ...handRaiseAllow,
      ],
      deny: [],
      reason: "Kick palco: KickSub view+connect+chat+hand",
    },
    {
      id: MOD_ROLE_ID,
      type: OverwriteType.Role,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.MoveMembers,
        PermissionsBitField.Flags.MuteMembers,
        PermissionsBitField.Flags.Stream,
        ...chatAllow,
        ...handRaiseAllow,
      ],
      reason: "Kick palco: KickModerator + video + chat + hand",
      deny: [],
    },
    {
      id: STREAMER_USER_ID,
      type: OverwriteType.Member,
      allow: streamerAllow,
      deny: [],
      reason: "Kick palco: streamer full control",
    },
  ];

  // Also give bot manage so it can keep renaming
  if (client.user?.id) {
    edits.push({
      id: client.user.id,
      type: OverwriteType.Member,
      allow: botAllow,
      deny: [],
      reason: "Kick palco: bot manage",
    });
  }

  for (const e of edits) {
    const payload = {};
    for (const flag of e.allow) {
      if (flag == null) continue;
      payload[flag] = true;
    }
    for (const flag of e.deny) {
      if (flag == null) continue;
      payload[flag] = false;
    }
    console.log("edit", e.id, e.reason, "flags", Object.keys(payload).length, DRY ? "(dry)" : "");
    if (!DRY) {
      await channel.permissionOverwrites.edit(e.id, payload, {
        type: e.type,
        reason: e.reason,
      });
    }
  }

  if (!DRY) {
    const fresh = await guild.channels.fetch(STAGE_ID);
    console.log("--- after ---");
    for (const o of fresh.permissionOverwrites.cache.values()) {
      console.log(
        JSON.stringify({
          id: o.id,
          type: o.type,
          allow: o.allow.toArray(),
          deny: o.deny.toArray(),
        }),
      );
    }
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
