const path = require("path");
const fs = require("fs");
const IDs = require("../Utils/Config/ids");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const { getGuildChannelCached, getGuildRoleCached } = require("../Utils/Interaction/interactionEntityCache");

const SPONSOR_PANEL_COLOR = "#6f4e37";
const SPONSOR_BATCH_SIZE = 6;

function sponsorVerifyPanelVerbose() {
  return String(process.env.SPONSOR_VERIFY_PANEL_VERBOSE || "").trim() === "1";
}

function sponsorVerifyPanelsDisabled(client) {
  const env = String(process.env.SPONSOR_VERIFY_PANELS || "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(env)) return true;
  return client?.config?.sponsorVerifyPanelsEnabled === false;
}
const TAG_IMAGE_NAME = "guildtag.gif";
const TAG_IMAGE_PATH = path.join(__dirname, "..", "Photos", TAG_IMAGE_NAME);
const VERIFY_OAUTH_IMAGE_NAME = "image0.jpg";
const VERIFY_OAUTH_IMAGE_PATH = path.join(__dirname, "..", "Photos", VERIFY_OAUTH_IMAGE_NAME);
const VERIFY_FALLBACK_IMAGE_NAME = "verifica.gif";
const VERIFY_FALLBACK_IMAGE_PATH = path.join(__dirname, "..", "Photos", VERIFY_FALLBACK_IMAGE_NAME);

function sponsorDividerLine() {
  return "<a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531>";
}

function buildSponsorTagEmbed(config, boosterRoleMention) {
  const { EmbedBuilder } = require("discord.js");
  return new EmbedBuilder()
    .setColor(SPONSOR_PANEL_COLOR)
    .setDescription(
      [
        `## <:VC_New:1471891729471770819> ── .✦ <a:VC_RightWing:1448672889845973214> ₊⋆˚｡ ${config.tagName}'s Guild-TAG`,
        sponsorDividerLine(),
        "",
        "",
        "**<a:VC_Arrow:1482706699365257397> Come mantenere la Guild-TAG <:VC_PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1482534702077444217> Ti basta essere parte di https://discord.gg/viniliecaffe oppure",
        `boostare questo server (<a:flyingnitroboost:1443652205705170986> ${boosterRoleMention})`,
        "",
        "",
        "**<a:VC_Arrow:1482706699365257397> How to keep the Guild-TAG <:VC_PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1482534702077444217> You just need to be in https://discord.gg/viniliecaffe or boost",
        `this server (<a:flyingnitroboost:1443652205705170986> ${boosterRoleMention})`,
        "",
        "",
        "<:VC_PepeComfy:1331591439599272004> Keep up! Nuovi aggiornamenti in arrivo...",
      ].join("\n"),
    )
    .setFooter({
      text: `.gg/viniliecaffe • ${new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    });
}

async function sponsorFetchGuild(client, guildId) {
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function sponsorEnsureChannelsFetched(guild) {
  if (!guild?.channels?.fetch) return;
  await guild.channels.fetch().catch(() => {});
}

async function sponsorFetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  let ch = guild.channels.cache.get(channelId);
  if (!ch) ch = await getGuildChannelCached(guild, channelId);
  return ch?.isTextBased?.() ? ch : null;
}

async function sponsorResolveRoleMention(guild, roleId, fallback = "`Role`") {
  if (!guild || !roleId) return fallback;
  const role = guild.roles.cache.get(roleId) || (await getGuildRoleCached(guild, roleId));
  return role ? `<@&${role.id}>` : fallback;
}

async function sponsorGetOrCreatePanelDoc(guildId, channelId) {
  return personalityPanelFindOneAndUpdate({ guildId, channelId }, { $setOnInsert: { guildId, channelId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

function sponsorMaybeAttachment(filePath, fileName, logLabel) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const { AttachmentBuilder } = require("discord.js");
    return new AttachmentBuilder(filePath, { name: fileName });
  } catch {
    global.logger.warn(`[${logLabel}] Image not found, sending without image`);
    return null;
  }
}

async function processOneGuildTagPanel(client, guildId, config) {
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

  const guild = await sponsorFetchGuild(client, guildId);
  if (!guild) {
    global.logger.warn("[SPONSOR GUILD TAG] Guild not found:", guildId);
    return;
  }
  const channel = await sponsorFetchTextChannel(guild, config.channelId);
  if (!channel) {
    global.logger.warn("[SPONSOR GUILD TAG] Channel not found:", guildId, config.channelId);
    return;
  }
  let boosterRoleMention = "`Server Booster`";
  if (config.boosterRoleId) {
    const role = guild.roles.cache.get(config.boosterRoleId) || (await getGuildRoleCached(guild, config.boosterRoleId));
    if (role) boosterRoleMention = `<@&${role.id}>`;
  }
  const embed = buildSponsorTagEmbed(config, boosterRoleMention);
  const attachment = sponsorMaybeAttachment(TAG_IMAGE_PATH, TAG_IMAGE_NAME, "SPONSOR GUILD TAG");
  if (attachment) embed.setImage(`attachment://${TAG_IMAGE_NAME}`);

  const panelDoc = await sponsorGetOrCreatePanelDoc(guildId, config.channelId).catch((err) => {
    global.logger.error("[SPONSOR GUILD TAG] Panel doc:", err);
    return null;
  });
  if (!panelDoc) return;

  const messagePayload = { messageId: panelDoc.infoMessageId1 || null, embeds: [embed], components: [], ...(attachment ? { files: [attachment], attachmentName: TAG_IMAGE_NAME } : {}) };
  const sentMessage = await upsertPanelMessage(channel, client, messagePayload);
  if (sentMessage?.id) {
    await personalityPanelUpdateOne({ guildId, channelId: config.channelId }, { $set: { infoMessageId1: sentMessage.id } }).catch(() => {});
  } else if (messagePayload.messageId) {
    await personalityPanelUpdateOne({ guildId, channelId: config.channelId }, { $set: { infoMessageId1: null } }).catch(() => {});
  }
}

async function runSponsorGuildTagPanels(client) {
  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const entries = Object.entries(guildTagConfig);
  for (let i = 0; i < entries.length; i += SPONSOR_BATCH_SIZE) {
    const batch = entries.slice(i, i + SPONSOR_BATCH_SIZE);
    await Promise.all(
      batch.map(([guildId, config]) =>
        processOneGuildTagPanel(client, guildId, config).catch((err) => global.logger.error("[SPONSOR GUILD TAG] Error guild " + guildId, err)),
      ),
    );
  }
}

async function runSponsorPanel(client) {
  try {
    await runSponsorGuildTagPanels(client);
    return 1;
  } catch (err) {
    global.logger.error("[SPONSOR] runSponsorPanel (Guild-TAG):", err?.message || err);
    return 0;
  }
}

async function processOneVerifyPanel(client, guildId, verifyChannelIds) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const guild = await sponsorFetchGuild(client, guildId);
  if (!guild) {
    if (sponsorVerifyPanelVerbose()) global.logger.warn("[SPONSOR] Verify panel: guild non trovata:", guildId);
    return 0;
  }
  await sponsorEnsureChannelsFetched(guild);
  let channel = await sponsorFetchTextChannel(guild, verifyChannelIds[guildId]);
  if (!channel) channel = guild.channels.cache.find((ch) => ch.name?.toLowerCase().includes("start")) || null;
  if (!channel?.isTextBased?.()) {
    global.logger.warn("[SPONSOR] Verify panel: canale non trovato in guild " + guild.name + " (" + guildId + ").");
    return 0;
  }

  const color = client.config?.embedVerify || SPONSOR_PANEL_COLOR;
  const verifyEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("<:verification:1461725843125571758> **`Verification Required!`**")
    .setDescription(
      "<:VC_Space:1482459974667075685> <:alarm:1461725841451909183> **Per accedere a `" +
        (guild.name || "this server") +
        "` devi prima verificarti.**\n" +
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.\n" +
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:VC_Reply:1482532158080942191> Gli unici dati a cui avremo accesso saranno, come indicato direttamente da Discord, nome utente, avatar e banner del tuo profilo.",
    );
  const verifyAttachment = sponsorMaybeAttachment(
    VERIFY_OAUTH_IMAGE_PATH,
    VERIFY_OAUTH_IMAGE_NAME,
    "SPONSOR VERIFY",
  ) || sponsorMaybeAttachment(
    VERIFY_FALLBACK_IMAGE_PATH,
    VERIFY_FALLBACK_IMAGE_NAME,
    "SPONSOR VERIFY",
  );
  if (verifyAttachment) verifyEmbed.setImage(`attachment://${verifyAttachment.name}`);
  const baseRaw = String(process.env.WEBSITE_PUBLIC_URL || "https://www.viniliecaffe.it").trim();
  const base = baseRaw.replace(/\/+$/, "");
  const verifyUrl = `${base}/verify/?guildId=${encodeURIComponent(String(guildId || ""))}`;
  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl)
      .setEmoji(`<a:VC_Verified:1482532479637127188>`)
      .setLabel("︲VERIFY"),
  );

  const panelDoc = await sponsorGetOrCreatePanelDoc(guildId, channel.id).catch(() => null);
  if (!panelDoc) return 0;

  const verifyPayload = {
    messageId: panelDoc.verifyPanelMessageId || null,
    embeds: [verifyEmbed],
    ...(verifyAttachment ? { files: [verifyAttachment], attachmentName: verifyAttachment.name } : {}),
    components: [verifyRow],
  };
  const panelMessage = await upsertPanelMessage(channel, client, verifyPayload);
  if (panelMessage?.id) {
    await personalityPanelUpdateOne({ guildId, channelId: channel.id }, { $set: { verifyPanelMessageId: panelMessage.id } }).catch(() => {});
  } else if (verifyPayload.messageId) {
    await personalityPanelUpdateOne({ guildId, channelId: channel.id }, { $set: { verifyPanelMessageId: null } }).catch(() => {});
  }
  return panelMessage?.id ? 1 : 0;
}

async function runSponsorVerifyPanels(client) {
  if (sponsorVerifyPanelsDisabled(client)) return 0;
  let sponsorGuildIds = Array.isArray(client.config?.sponsorGuildIds) ? [...client.config.sponsorGuildIds] : [];
  const verifyChannelIds = client.config?.sponsorVerifyChannelIds || {};
  if (sponsorGuildIds.length === 0) sponsorGuildIds = Object.keys(verifyChannelIds);
  if (sponsorGuildIds.length === 0) {
    global.logger.warn("[SPONSOR] runSponsorVerifyPanels: nessuna guild in config.");
    return 0;
  }

  let sent = 0;
  for (let i = 0; i < sponsorGuildIds.length; i += SPONSOR_BATCH_SIZE) {
    const batch = sponsorGuildIds.slice(i, i + SPONSOR_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((guildId) =>
        processOneVerifyPanel(client, guildId, verifyChannelIds).catch((err) => {
          global.logger.error("[SPONSOR] runSponsorVerifyPanels guild " + guildId + ":", err?.message || err);
          return 0;
        }),
      ),
    );
    sent += results.reduce((a, n) => a + n, 0);
  }
  return sent;
}

async function runSponsorTicketPanels() {
  return 0;
}

module.exports = {
  runSponsorPanel,
  runSponsorVerifyPanels,
  runSponsorTicketPanels,
};