const { PermissionsBitField } = require("discord.js");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getSession, buildPreviewEmbed, buildEditModal, buildSendModal, isValidUrl, updatePreview } = require("../../Utils/Interaction/embedBuilderUtils");
const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "embedBuilderSessionsSnapshot.json");
const SESSION_TTL_MS = 60 * 60 * 1000;

function ensureEmbedBuilderSessionsLoaded(client) {
  if (!client || client._embedBuilderSessionsLoaded) return;
  client._embedBuilderSessionsLoaded = true;
  if (!client.embedBuilderSessions) client.embedBuilderSessions = new Map();
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_embed_builder_sessions",
    version: 1,
    fallback: {},
  });
  const now = Date.now();
  for (const [messageId, session] of Object.entries(raw || {})) {
    if (!messageId || !session) continue;
    const updatedAt = Number(session?.updatedAt || 0);
    if (!updatedAt || now - updatedAt > SESSION_TTL_MS) continue;
    client.embedBuilderSessions.set(String(messageId), session);
  }
}

function persistEmbedBuilderSessionsNow(client) {
  if (!client?.embedBuilderSessions) return;
  const now = Date.now();
  const payload = {};
  for (const [messageId, session] of client.embedBuilderSessions.entries()) {
    const updatedAt = Number(session?.updatedAt || 0);
    if (!updatedAt || now - updatedAt > SESSION_TTL_MS) continue;
    payload[String(messageId)] = session;
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_embed_builder_sessions",
    version: 1,
    payload,
  });
}

async function handleEmbedBuilderInteraction(interaction, client) {
  const cid = String(interaction?.customId || "");
  if (!cid.startsWith("eb:") && !cid.startsWith("ebm:")) return false;

  ensureEmbedBuilderSessionsLoaded(client);
  if (!client.embedBuilderSessions) client.embedBuilderSessions = new Map();

  if (interaction.isButton && interaction.isButton()) {
    const parts = cid.split(":");
    const kind = parts[1];
    const ownerId = parts[2];
    const messageId = interaction.message?.id;

    if (!ownerId || !messageId) return false;
    if (interaction.user.id !== ownerId) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> Questo builder non è tuo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const session = getSession(client, messageId);
    if (!session) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Sessione scaduta o non trovata.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    if (kind === "send") {
      await interaction
        .showModal(buildSendModal(ownerId, messageId))
        .catch(() => { });
      return true;
    }

    const current = kind === "content" ? session.content || null : session.embed?.[kind] || null;
    await interaction
      .showModal(buildEditModal(kind, ownerId, messageId, current))
      .catch(() => { });
    return true;
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit()) {
    const parts = cid.split(":");
    const kind = parts[1];
    const ownerId = parts[2];
    const messageId = parts[3];

    if (!ownerId || !messageId) return false;
    if (interaction.user.id !== ownerId) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> Questo builder non è tuo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const session = getSession(client, messageId);
    if (!session) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> Sessione scaduta o non trovata.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    if (kind === "send") {
      const rawChannelId = String(interaction.fields.getTextInputValue("channelId") || "",).trim();
      const channel = await getClientChannelCached(client, rawChannelId);
      if (!channel?.isTextBased?.()) {
        await interaction
          .reply({
            content: "<a:VC_Alert:1482706673176150077> Canale non valido.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }

      const me = channel.guild?.members?.me || (channel.guild ? await channel.guild.members.fetchMe().catch(() => null) : null);
      if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
          await interaction
            .reply({
              content:
                "<a:VC_Alert:1482706673176150077> Non ho permesso di scrivere in quel canale.",
              flags: 1 << 6,
            })
            .catch(() => { });
          return true;
        }
      }

      const sentMessage = await channel
        .send({
          content: String(session?.content || "").trim() || undefined,
          embeds: [buildPreviewEmbed(session.embed)],
          components: [],
        })
        .catch(() => null);
      if (!sentMessage) {
        await interaction
          .reply({
            content:
              "<a:VC_Alert:1482706673176150077> Non sono riuscito a inviare l'embed in quel canale.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }

      await interaction
        .reply({ content: "<:success:1461731530333229226> Embed inviato con successo!", flags: 1 << 6 })
        .catch(() => { });
      return true;
    }

    let value = String(
      interaction.fields.getTextInputValue("value") || "",
    ).trim();

    if (!session.embed) session.embed = {};
    if (kind === "content") {
      session.content = value || "";
    } else if (!value) {
      if (kind === "color") session.embed.color = "#6f4e37";
      else delete session.embed[kind];
    } else if (kind === "color") {
      const normalized = (() => {
        const hex = value.startsWith("#") ? value : `#${value}`;
        return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
      })();
      if (!normalized) {
        await interaction
          .reply({
            content:
              "<a:VC_Alert:1482706673176150077> Colore non valido. Usa tipo `#6f4e37`.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      session.embed.color = normalized;
    } else if (
      (kind === "thumbnail" || kind === "image") &&
      !isValidUrl(value)
    ) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1482706673176150077> URL non valido (usa http/https).",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    } else {
      const maxLen = kind === "description" ? 4096 : kind === "footer" ? 2048 : 256;
      session.embed[kind] = value.slice(0, maxLen);
    }

    session.updatedAt = Date.now();
    client.embedBuilderSessions.set(messageId, session);
    persistEmbedBuilderSessionsNow(client);

    await updatePreview(interaction, session);

    await interaction
      .reply({ content: "<:success:1461731530333229226> Anteprima aggiornata con successo.", flags: 1 << 6 })
      .catch(() => { });
    return true;
  }

  return false;
}

module.exports = { handleEmbedBuilderInteraction };