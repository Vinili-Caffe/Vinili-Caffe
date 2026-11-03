/** Ruoli personalizzati: richieste di creazione e di ingresso dal sito. */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const crypto = require("crypto") as typeof import("crypto");
const { getClientGuildCached, getGuildChannelCached, getUserCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { fetchGuildChannel, fetchGuildMember, fetchGuildRole } = require("../../Community/utils/customRoleUtils") as typeof import("../../Community/utils/customRoleUtils");
const { pendingRoleGrants, pendingSiteRoleRequests, PENDING_SITE_ROLE_DOC, persistPendingSiteRoleRequest, deletePendingSiteRoleRequest, resolvePendingSiteRoleRequest, persistPendingRoleGrant, deletePendingRoleGrant, resolvePendingRoleGrant, persistPendingNow, ensurePendingLoaded } = require("./customRolePending") as typeof import("./customRolePending");

/** Same TTL as site role join requests (createSiteRoleJoinRequest). */
const CUSTOM_ROLE_GRANT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

async function createCustomRoleGrantRequest({ client, guildId, channelId, requesterId, targetId, roleId, timeoutMs = CUSTOM_ROLE_GRANT_TTL_MS }) {
  const guild = await getClientGuildCached(client, guildId);
  const channel = channelId ? await fetchGuildChannel(guild, channelId) : null;
  const targetMember = await fetchGuildMember(guild, targetId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
    if (!guild || !targetMember || !requesterMember || !role) {
    return { ok: false, error: "invalid_context" };
  }
  if (channelId && !channel) {
    return { ok: false, error: "channel_missing" };
  }

  const token = crypto.randomBytes(16).toString("hex");
  const dmRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji("<:vegacheckmark:1443666279058772028>")
    .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
  const dmEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta ruolo personalizzato")
    .setDescription(
      `${requesterMember} vuole aggiungerti il ruolo **${role.name}** nel server. Accetti?`,
    );

  const targetUser = targetMember.user || (await getUserCached(client, targetId));
  const dmSent =
    targetUser && typeof targetUser.send === "function"
      ? await targetUser.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => null)
      : null;
  if (!dmSent) {
    if (channel) {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<a:VC_Alert:1482706673176150077> Impossibile inviare DM")
              .setDescription(
                `<:vegax:1443934876440068179> Non posso inviare il messaggio privato a ${targetMember}.`,
              ),
          ],
        })
        .catch(() => null);
    }
    return { ok: false, error: "dm_closed" };
  }

  const waitingEmbed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<a:VC_pixeltime:1482535344103620771> In attesa di conferma")
    .setDescription(
      `<a:VC_Timer:1482527426557775954> Sto aspettando che ${targetMember} accetti di ricevere il ruolo **${role.name}**.`,
    );
  let promptMsg = null;
  if (channel) {
    promptMsg = await channel.send({ embeds: [waitingEmbed] }).catch(() => null);
    if (!promptMsg) {
      await dmSent.edit({ components: [] }).catch(() => {});
      return { ok: false, error: "channel_send_failed" };
    }
  }

  ensurePendingLoaded();
  const grantTtlMs = Math.max(15_000, Number(timeoutMs || CUSTOM_ROLE_GRANT_TTL_MS) || CUSTOM_ROLE_GRANT_TTL_MS);
  pendingRoleGrants.set(token, {
    guildId,
    channelId: channelId ? String(channelId) : null,
    requesterId,
    targetId,
    roleId,
    promptMessageId: promptMsg?.id || null,
    dmChannelId: dmSent.channelId,
    dmMessageId: dmSent.id,
    expiresAt: Date.now() + grantTtlMs,
  });
  persistPendingNow();
  await persistPendingRoleGrant(token, pendingRoleGrants.get(token));

  const expiryTimer = setTimeout(
    async () => {
      ensurePendingLoaded();
      const req = (await resolvePendingRoleGrant(token)) || pendingRoleGrants.get(token);
      if (!req) return;
      await deletePendingRoleGrant(token);
      persistPendingNow();
      const g = await getClientGuildCached(client, req.guildId);
      if (req.channelId && req.promptMessageId) {
        const ch = await fetchGuildChannel(g, req.channelId);
        const msg =
          ch?.messages?.cache?.get(req.promptMessageId) ||
          (await ch?.messages?.fetch(req.promptMessageId).catch(() => null));
        if (msg) {
          await msg
            .edit({
              embeds: [
                new EmbedBuilder()
                  .setColor("#e67e22")
                  .setTitle("<:VC_update:1478721333096349817> Scaduto")
                  .setDescription(`<a:VC_Timer:1482527426557775954> <@${req.targetId}> non ha risposto in tempo.`),
              ],
            })
            .catch(() => {});
        }
      }

      const user = await getUserCached(client, req.targetId);
      const dmChannel = user?.dmChannel || (await user?.createDM().catch(() => null));
      const dmMsg =
        dmChannel?.messages?.cache?.get(req.dmMessageId) ||
        (await dmChannel?.messages?.fetch(req.dmMessageId).catch(() => null));
      if (dmMsg) {
        await dmMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#e67e22")
                .setTitle("<:VC_update:1478721333096349817> Scaduto")
                .setDescription("<a:VC_Timer:1482527426557775954> Tempo scaduto: la richiesta non è più valida."),
            ],
            components: [],
          })
          .catch(() => {});
      }
    },
    grantTtlMs,
  );
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true, promptMessageId: promptMsg?.id || null, dmOnly: !channel };
}

function buildSiteRoleRequestButtons(token?, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:approve`)
      .setLabel("Approva")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:reject`)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function createSiteRoleJoinRequest({ client, guildId, requesterId, ownerId, roleId, reason, timeoutMs = 3 * 24 * 60 * 60 * 1000 }) {
  const guild = await getClientGuildCached(client, guildId);
  const ownerMember = await fetchGuildMember(guild, ownerId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
  if (!guild || !ownerMember || !requesterMember || !role) {
    return { ok: false, error: "invalid_context" };
  }

  const now = Date.now();
  for (const [pendingToken, request] of pendingSiteRoleRequests.entries()) {
    if (!request) continue;
    if (Number(request.expiresAt || 0) <= now) {
      ensurePendingLoaded();
      await deletePendingSiteRoleRequest(pendingToken);
      persistPendingNow();
      continue;
    }
    if (
      String(request.guildId || "") === String(guildId) &&
      String(request.requesterId || "") === String(requesterId) &&
      String(request.ownerId || "") === String(ownerId) &&
      String(request.roleId || "") === String(roleId)
    ) {
      return { ok: false, error: "already_pending" };
    }
  }
  const mongoPending = await SiteDocument.findOne({
    docType: PENDING_SITE_ROLE_DOC,
    guildId: String(guildId),
    requesterId: String(requesterId),
    ownerId: String(ownerId),
    roleId: String(roleId),
    expiresAt: { $gt: new Date(now) },
  })
    .lean()
    .catch(() => null);
  if (mongoPending) return { ok: false, error: "already_pending" };

  const token = crypto.randomBytes(16).toString("hex");
  const ownerUser = ownerMember.user || (await getUserCached(client, ownerId));
  const requesterUser = requesterMember.user || (await getUserCached(client, requesterId));
  if (!ownerUser || typeof ownerUser.send !== "function") {
    return { ok: false, error: "dm_closed" };
  }
  const requesterMention = `<@${requesterId}>`;
  const dmEmbed = new EmbedBuilder()
    .setColor("#8b5cf6")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta di accesso al tuo ruolo")
    .setDescription(
      [
        `${requesterMention} vuole ottenere il tuo ruolo personalizzato **${role.name}**.`,
        "",
        `**Utente:** ${requesterMention} (\`${requesterId}\`)`,
                `**Ruolo:** **${role.name}** (\`${role.id}\`)`,
        "",
        "**Motivazione**",
        String(reason || "Nessuna motivazione."),
      ].join("\n"),
    )
    .setFooter({ text: "Puoi approvare o rifiutare direttamente da qui." })
    .setTimestamp(new Date());
  const reqThumb = userAvatarUrlDynamic(requesterUser, { size: 256 });
  if (reqThumb) dmEmbed.setThumbnail(reqThumb);

    const dmSent = await ownerUser
    .send({
      embeds: [dmEmbed],
      components: [buildSiteRoleRequestButtons(token, false)],
    })
    .catch(() => null);
  if (!dmSent) {
    return { ok: false, error: "dm_closed" };
  }

  ensurePendingLoaded();
  pendingSiteRoleRequests.set(token, { guildId, requesterId, ownerId, roleId, reason: String(reason || ""), dmChannelId: dmSent.channelId, dmMessageId: dmSent.id, expiresAt: now + Math.max(15_000, Number(timeoutMs || 0)), });
  persistPendingNow();
  await persistPendingSiteRoleRequest(token, pendingSiteRoleRequests.get(token));

  const expiryTimer = setTimeout(async () => {
    ensurePendingLoaded();
    const request = (await resolvePendingSiteRoleRequest(token)) || pendingSiteRoleRequests.get(token);
    if (!request) return;
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    let dmMsg = null;
    const channelId = String(request.dmChannelId || "").trim();
    const messageId = String(request.dmMessageId || "").trim();
    if (channelId && messageId) {
      const dmChannel =
        (await getGuildChannelCached(client, channelId).catch(() => null)) ||
        (typeof client?.channels?.fetch === "function" ? await client.channels.fetch(channelId).catch(() => null) : null);
      dmMsg =
        dmChannel?.messages?.cache?.get(messageId) ||
        (await dmChannel?.messages?.fetch?.(messageId).catch(() => null));
    }
    if (!dmMsg) {
      const owner = await getUserCached(client, request.ownerId);
      const dmChannel =
        owner?.dmChannel ||
        (typeof owner?.createDM === "function" ? await owner.createDM().catch(() => null) : null) ||
        (typeof client?.users?.createDM === "function" ? await client.users.createDM(request.ownerId).catch(() => null) : null);
      dmMsg =
        dmChannel?.messages?.cache?.get(request.dmMessageId) ||
        (await dmChannel?.messages?.fetch?.(request.dmMessageId).catch(() => null));
    }
    if (dmMsg) {
      await dmMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:VC_update:1478721333096349817> Richiesta scaduta")
              .setDescription("La richiesta del ruolo non è più valida: tempo scaduto."),
          ],
          components: [buildSiteRoleRequestButtons(token, true)],
        })
        .catch(() => { });
    }
  }, Math.max(15_000, Number(timeoutMs || 0)));
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true };
}

export = { createCustomRoleGrantRequest, buildSiteRoleRequestButtons, createSiteRoleJoinRequest };
