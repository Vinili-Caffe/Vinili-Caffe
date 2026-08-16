#!/usr/bin/env node
/**
 * One-shot: reconcile incomplete active mute mirrors (REST client).
 * Run: node /opt/bot/Vinyls/Scripts/reconcileActiveMutesOnce.js
 */
async function main() {
  const {
    loadDotEnv,
    loadVinylsConfig,
    resolveMongoUrl,
    resolveDiscordToken,
    installConsoleLogger,
  } = require("../Services/Web/workerAppBootstrap");
  const { createSiteApiRestClient } = require("../Services/Web/siteApiRestClient");
  const mongoose = require("mongoose");
  const {
    reconcileIncompleteActiveMuteMirrors,
    applyActiveMuteMirror,
    isCommunicationTimeoutActive,
  } = require("../Services/Moderation/mutedMirrorRoleService");
  const { getClientGuildCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
  const IDs = require("../Utils/Config/ids");
  const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas");

  loadDotEnv();
  installConsoleLogger();
  const mongo = resolveMongoUrl();
  const token = resolveDiscordToken();
  if (!mongo || !token) {
    console.error("missing mongo/token");
    process.exit(1);
  }
  await mongoose.connect(mongo, { maxPoolSize: 4, serverSelectionTimeoutMS: 12000 });
  const config = loadVinylsConfig();
  const client = await createSiteApiRestClient(config, token);
  global.botClient = client;

  const now = new Date();
  const rows = await ActivityUserProfile.find({
    "moderation.modCases": {
      $elemMatch: { action: "MUTE", active: { $ne: false }, expiresAt: { $gt: now } },
    },
  })
    .select("userId guildId moderation.modCases")
    .lean();

  const mutedRoleId = String(IDs.roles?.Muted || "");
  console.log("[check] active mute profiles", rows.length, "mutedRole", mutedRoleId);

  for (const r of rows) {
    const guildId = String(r.guildId || "");
    const userId = String(r.userId || "");
    const guild = await getClientGuildCached(client, guildId);
    const member = guild
      ? await getGuildMemberCached(guild, userId, { preferFresh: true }).catch((e) => {
          console.log("[check] member fetch fail", userId, e?.message || e);
          return null;
        })
      : null;
    const timeoutActive = member ? isCommunicationTimeoutActive(member) : false;
    const hasMuted = member && mutedRoleId ? member.roles.cache.has(mutedRoleId) : false;
    const roleCount = member?.roles?.cache?.size || 0;
    console.log(
      `[check] user=${userId} guildOk=${Boolean(guild)} memberOk=${Boolean(member)} timeout=${timeoutActive} muted=${hasMuted} roles=${roleCount}`,
    );
    if (member && timeoutActive && !hasMuted) {
      const result = await applyActiveMuteMirror(member, {
        reason: "Timeout Discord / +mute (manual one-shot)",
      });
      console.log("[fix]", userId, result);
    }
  }

  const summary = await reconcileIncompleteActiveMuteMirrors(client, {
    limit: 80,
    scanTimedOutMembers: true,
  });
  console.log("[reconcile summary]", summary);
  await mongoose.disconnect().catch(() => null);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
