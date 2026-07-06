const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { CURRENCY_CAFFE, CURRENCY_VINILI, formatCurrency } = require("../../Services/Community/serverWalletService");
const { formatDuration } = require("../../Services/Community/activeEconomyService");
const { getShopPanelState, purchaseShopItem } = require("../../Services/Community/serverShopService");

const PREFIX = "shop_gui";
const SESSION_TTL_MS = 12 * 60 * 1000;
const SHOP_COLOR = 0x6f4e37;
const sessions = new Map();

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function makeSession({ ownerId, guildId, currency, panelState }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    currency: currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE,
    panelState: panelState || null,
    lastNotice: "",
    panelClosed: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function setSession(messageId, session) {
  sessions.set(sessionKey(messageId), { ...session, updatedAt: now() });
}

function getSession(messageId) {
  const key = sessionKey(messageId);
  const cached = sessions.get(key);
  if (!cached) return null;
  if (now() - Number(cached.updatedAt || cached.createdAt || 0) > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return cached;
}

function deleteSession(messageId) {
  sessions.delete(sessionKey(messageId));
}

function controlId(action, ownerId, extra = "") {
  const tail = String(extra || "").trim();
  return tail ? `${PREFIX}:${action}:${ownerId}:${tail}` : `${PREFIX}:${action}:${ownerId}`;
}

function isShopGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseShopGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2], itemId: parts[3] || "" };
}

function currencyTitle(currency) {
  return currency === CURRENCY_VINILI ? "Shop Vinili" : "Shop Caffè";
}

function currencyEmoji(currency) {
  return currency === CURRENCY_VINILI ? "💿" : "☕";
}

function buildItemFields(items = []) {
  return items.map((item) => ({
    name: `${item.emoji || "🛒"} ${item.name} — ${formatCurrency(item.currency, item.price)}`,
    value: item.description,
    inline: false,
  }));
}

function buildEmbed(session) {
  const state = session.panelState || {};
  const cur = session.currency === CURRENCY_VINILI ? CURRENCY_VINILI : CURRENCY_CAFFE;
  const boostBlock = Array.isArray(state.boostLines) && state.boostLines.length
    ? `\n\n**Boost attivi**\n${state.boostLines.map((line) => `• ${line}`).join("\n")}`
    : "";
  const shieldBlock = state.protectionMs > 0
    ? `\n\n🛡️ Protezione furto: **${formatDuration(state.protectionMs)}**`
    : "";
  return new EmbedBuilder()
    .setColor(SHOP_COLOR)
    .setTitle(`${currencyEmoji(cur)} ${currencyTitle(cur)}`)
    .setDescription(
      `Saldo: **${formatCurrency(cur, state.balance || 0)}**\nScegli un oggetto qui sotto.${boostBlock}${shieldBlock}`,
    )
    .addFields(buildItemFields(state.items || []))
    .setFooter({ text: session.lastNotice ? String(session.lastNotice).slice(0, 180) : "Vinili & Caffè Bot Ufficiale" });
}

function buildRows(session, panelClosed = false) {
  const ownerId = session.ownerId;
  const locked = Boolean(panelClosed);
  const itemRows = [];
  const items = Array.isArray(session.panelState?.items) ? session.panelState.items : [];
  for (let i = 0; i < items.length; i += 3) {
    const chunk = items.slice(i, i + 3);
    itemRows.push(
      new ActionRowBuilder().addComponents(
        ...chunk.map((item) =>
          new ButtonBuilder()
            .setCustomId(controlId("buy", ownerId, item.id))
            .setLabel(`${item.name}`.slice(0, 80))
            .setEmoji(item.emoji || "🛒")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(locked),
        ),
      ),
    );
  }
  itemRows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("pick_vinili", ownerId))
        .setLabel("Vinili")
        .setEmoji("💿")
        .setStyle(session.currency === CURRENCY_VINILI ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(locked),
      new ButtonBuilder()
        .setCustomId(controlId("pick_caffe", ownerId))
        .setLabel("Caffè")
        .setEmoji("☕")
        .setStyle(session.currency === CURRENCY_CAFFE ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("refresh", ownerId)).setLabel("Aggiorna").setEmoji("🔄").setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ),
  );
  return itemRows;
}

function buildShopPayload(session, panelClosed = false) {
  return {
    content: null,
    embeds: [buildEmbed(session)],
    components: buildRows(session, panelClosed),
    allowedMentions: { repliedUser: false },
  };
}

async function reloadPanelState(client, message, session) {
  const state = await getShopPanelState(client, message, session.currency);
  if (!state.ok) return state;
  session.panelState = state;
  session.currency = state.currency;
  session.updatedAt = now();
  return { ok: true, state };
}

async function openShopPanel(client, message, currency = CURRENCY_CAFFE) {
  const state = await getShopPanelState(client, message, currency);
  if (!state.ok) return state;
  const session = makeSession({
    ownerId: message.author.id,
    guildId: message.guild.id,
    currency: state.currency,
    panelState: state,
  });
  return { ok: true, session, payload: buildShopPayload(session) };
}

async function purchaseFromSession(client, message, session, itemId) {
  const out = await purchaseShopItem(client, message, itemId);
  if (!out.ok) return out;
  session.lastNotice = out.message || "Acquisto completato.";
  const reload = await reloadPanelState(client, message, session);
  if (!reload.ok) return reload;
  return { ok: true, message: out.message, payload: buildShopPayload(session) };
}

module.exports = {
  buildShopPayload,
  deleteSession,
  getSession,
  isShopGuiCustomId,
  openShopPanel,
  parseShopGuiCustomId,
  purchaseFromSession,
  reloadPanelState,
  setSession,
};