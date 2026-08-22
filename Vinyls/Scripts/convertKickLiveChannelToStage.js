#!/usr/bin/env node
"use strict";

/**
 * Converte il canale live Kick in Stage (palco) gestito dal bot
 * e scollega customVocChannelId nel DB così l'utente può ricreare la vocale privata.
 *
 * Usage:
 *   node Vinyls/Scripts/convertKickLiveChannelToStage.js
 *   node Vinyls/Scripts/convertKickLiveChannelToStage.js --dry-run
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

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, OverwriteType } = require("discord.js");
const mongoose = require("mongoose");

const CHANNEL_ID = "1539417055391121440";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const vinylsRoot = path.resolve(__dirname, "..");
  const botRoot = path.resolve(vinylsRoot, "..");
  process.chdir(botRoot);

  const config = require(path.join(vinylsRoot, "config.json"));
  const IDs = require(path.join(vinylsRoot, "Utils", "Config", "ids"));
  const { CustomRole } = require(path.join(vinylsRoot, "Schemas", "Community", "communitySchemas"));
  const { unlinkCustomVocChannelByChannelId } = require(path.join(
    vinylsRoot,
    "Services",
    "Community",
    "customVocChannelCleanupService",
  ));

  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGODB_URI_LOCAL ||
    "";
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  const token =
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.DISCORD_TOKEN ||
    config.token;
  if (!token) throw new Error("Token Discord mancante");

  await mongoose.connect(mongoUrl);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const guildId = String(IDs?.guilds?.main || config?.mainGuildId || "").trim();
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  const channel =
    guild.channels.cache.get(CHANNEL_ID) ||
    (await guild.channels.fetch(CHANNEL_ID).catch(() => null));

  if (!channel) {
    throw new Error(`Canale ${CHANNEL_ID} non trovato`);
  }

  const parent = channel.parentId
    ? guild.channels.cache.get(channel.parentId) || (await guild.channels.fetch(channel.parentId).catch(() => null))
    : null;

  const memberOverwrites = [];
  for (const ow of channel.permissionOverwrites?.cache?.values?.() || []) {
    if (ow.type !== OverwriteType.Member) continue;
    memberOverwrites.push({
      id: ow.id,
      allow: ow.allow?.toArray?.() || [],
      deny: ow.deny?.toArray?.() || [],
    });
  }

  const dbBefore = await CustomRole.find(
    { guildId, customVocChannelId: CHANNEL_ID },
    { userId: 1, customVocChannelId: 1 },
  ).lean();

  const voiceNameOff =
    String(config?.kickLiveAlerts?.streamers?.[0]?.voiceNameOff || "").trim() ||
    "༄🔴︲Streaming D1uk: OFF";

  const targetParentId = null; // resta nella categoria LIVE attuale
  const membersInChannel = guild.members.cache.filter((m) => m.voice?.channelId === CHANNEL_ID).size;
  // Prefer live voice states from channel if available
  let connected = membersInChannel;
  try {
    if (typeof channel.members?.size === "number") connected = channel.members.size;
  } catch (_) {}

  const summary = {
    dryRun: DRY_RUN,
    channel: {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      typeLabel:
        channel.type === ChannelType.GuildStageVoice
          ? "Stage"
          : channel.type === ChannelType.GuildVoice
            ? "Voice"
            : String(channel.type),
      parentId: channel.parentId || null,
      parentName: parent?.name || null,
      connectedMembers: connected,
      memberOverwrites,
    },
    dbOwners: dbBefore.map((d) => String(d.userId)),
    planned: {
      convertToStage: channel.type !== ChannelType.GuildStageVoice,
      unlinkDb: dbBefore.length > 0,
      stripUserManageOverwrites: memberOverwrites.length > 0,
      moveToPublics: false,
      keepParentId: channel.parentId || null,
      targetParentId: null,
      setNameIfNeeded: channel.name !== voiceNameOff ? voiceNameOff : null,
    },
  };
  console.log(JSON.stringify(summary, null, 2));

  if (DRY_RUN) {
    await client.destroy();
    await mongoose.disconnect();
    return;
  }

  // 1) DB unlink first so recreate is free even if Discord edits fail partially
  const unlink = await unlinkCustomVocChannelByChannelId(guildId, CHANNEL_ID);
  console.log("[db] unlink", unlink);
  // Force-clear streamer profile only if still pointing at the live channel
  const streamerUserId = String(config?.kickLiveAlerts?.streamers?.[0]?.discordUserId || "610531025470095390").trim();
  if (streamerUserId) {
    const forced = await CustomRole.updateOne(
      { guildId, userId: streamerUserId, customVocChannelId: CHANNEL_ID },
      { $set: { customVocChannelId: null } },
    ).catch(() => null);
    console.log("[db] forced clear if linked", {
      userId: streamerUserId,
      matched: forced?.matchedCount || 0,
      modified: forced?.modifiedCount || 0,
    });
  }

  // 2) Disconnect users if converting (Discord often requires empty channel)
  if (channel.type !== ChannelType.GuildStageVoice && connected > 0) {
    for (const [, member] of channel.members) {
      await member.voice.disconnect("Conversione canale live → palco bot").catch(() => {});
    }
  }

  // 3) Convert to Stage, or recreate if Discord rejects in-place type change
  let stage = channel;
  let newChannelId = CHANNEL_ID;
  if (channel.type !== ChannelType.GuildStageVoice) {
    let converted = false;
    try {
      if (typeof channel.setType === "function") {
        await channel.setType(ChannelType.GuildStageVoice, "Kick live: palco gestito dal bot");
      } else {
        await channel.edit({
          type: ChannelType.GuildStageVoice,
          reason: "Kick live: palco gestito dal bot",
        });
      }
      converted = true;
      console.log("[discord] converted to Stage in-place");
    } catch (err) {
      const code = err?.code || err?.rawError?.code;
      console.warn("[discord] in-place convert failed:", code, err?.message || err);
    }

    if (!converted) {
      const parentId = channel.parentId || null;
      const position = channel.rawPosition ?? channel.position ?? undefined;
      const roleOverwrites = [];
      for (const ow of channel.permissionOverwrites?.cache?.values?.() || []) {
        if (ow.type !== OverwriteType.Role) continue;
        roleOverwrites.push({
          id: ow.id,
          type: OverwriteType.Role,
          allow: ow.allow,
          deny: ow.deny,
        });
      }
      const created = await guild.channels.create({
        name: (voiceNameOff || channel.name || "live").slice(0, 100),
        type: ChannelType.GuildStageVoice,
        parent: parentId || undefined,
        reason: "Kick live: nuovo palco gestito dal bot (convert non supportato)",
        permissionOverwrites: roleOverwrites,
      });
      if (Number.isFinite(position)) {
        await created.setPosition(position, { reason: "Kick live palco: stessa posizione" }).catch(() => {});
      }
      console.log("[discord] created Stage", created.id, "old", CHANNEL_ID);

      // Delete old private-owned voice
      await channel.delete("Kick live: sostituito da palco gestito dal bot").catch((err) => {
        console.warn("[discord] old channel delete failed", err?.message || err);
      });

      stage = created;
      newChannelId = created.id;

      // Update live config to the new stage id
      const cfgPath = path.join(vinylsRoot, "config.json");
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (cfg.kickLiveAlerts) {
        cfg.kickLiveAlerts.streamVoiceChannelId = newChannelId;
        if (Array.isArray(cfg.kickLiveAlerts.streamers)) {
          for (const s of cfg.kickLiveAlerts.streamers) {
            if (!s || typeof s !== "object") continue;
            if (!s.streamVoiceChannelId || String(s.streamVoiceChannelId) === CHANNEL_ID) {
              s.streamVoiceChannelId = newChannelId;
            }
          }
        }
      }
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
      console.log("[config] kickLiveAlerts.streamVoiceChannelId ->", newChannelId);
    } else {
      stage =
        guild.channels.cache.get(CHANNEL_ID) ||
        (await guild.channels.fetch(CHANNEL_ID));
    }
  } else {
    stage =
      guild.channels.cache.get(CHANNEL_ID) ||
      (await guild.channels.fetch(CHANNEL_ID));
  }

  // 4) Keep current LIVE category (already set on create / convert)

  // 5) Strip private-owner user overwrites (keep bot)
  const botId = String(client.user.id);
  for (const ow of [...(stage.permissionOverwrites?.cache?.values?.() || [])]) {
    if (ow.type !== OverwriteType.Member) continue;
    if (String(ow.id) === botId) continue;
    await stage.permissionOverwrites.delete(ow.id, "Kick live palco: rimozione owner vocale privata").catch((err) => {
      console.warn("[discord] overwrite delete failed", ow.id, err?.message || err);
    });
  }

  // Ensure bot can manage the stage
  await stage.permissionOverwrites
    .edit(
      botId,
      {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        ManageChannels: true,
        MoveMembers: true,
        MuteMembers: true,
        RequestToSpeak: true,
      },
      { type: OverwriteType.Member, reason: "Kick live palco: permessi bot" },
    )
    .catch((err) => console.warn("[discord] bot overwrite failed", err?.message || err));

  // Public visibility baseline (Member role if present, else @everyone connect)
  const memberRoleId = String(IDs?.roles?.Member || "").trim();
  if (memberRoleId) {
    await stage.permissionOverwrites
      .edit(
        memberRoleId,
        {
          ViewChannel: true,
          Connect: true,
          // Stage: audience by default; speaking via request
          Speak: false,
          RequestToSpeak: true,
          SendMessages: true,
        },
        { type: OverwriteType.Role, reason: "Kick live palco: accesso community" },
      )
      .catch((err) => console.warn("[discord] member role overwrite failed", err?.message || err));
  }

  // 6) Name OFF (bot-managed naming via kick live loop)
  if (voiceNameOff && stage.name !== voiceNameOff) {
    await stage.setName(voiceNameOff.slice(0, 100), "Kick live palco: nome gestito dal bot").catch((err) => {
      console.warn("[discord] rename failed", err?.message || err);
    });
  }

  const afterDbOld = await CustomRole.find(
    { guildId, customVocChannelId: CHANNEL_ID },
    { userId: 1 },
  ).lean();
  const afterDbNew = await CustomRole.find(
    { guildId, customVocChannelId: newChannelId },
    { userId: 1 },
  ).lean();
  const finalCh = await guild.channels.fetch(newChannelId).catch(() => stage);

  console.log(
    JSON.stringify(
      {
        ok: true,
        final: {
          id: finalCh.id,
          name: finalCh.name,
          type: finalCh.type,
          typeLabel: finalCh.type === ChannelType.GuildStageVoice ? "Stage" : String(finalCh.type),
          parentId: finalCh.parentId || null,
          replacedOldChannelId: newChannelId !== CHANNEL_ID ? CHANNEL_ID : null,
          dbStillLinkedOld: afterDbOld.map((d) => String(d.userId)),
          dbStillLinkedNew: afterDbNew.map((d) => String(d.userId)),
        },
      },
      null,
      2,
    ),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
