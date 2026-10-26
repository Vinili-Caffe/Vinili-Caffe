const IDs = require("../Utils/Config/ids");
const {
  refreshTicketConfigCache,
  getTicketSettingsSync,
} = require("../MultiGuild/core/tenantTicketSettings");
const { ensureMainTicketPanelsSeeded, MAIN_MULTI_SEED } = require("../Utils/Ticket/ticketPanelsMainSync");
const { getGuildPanels } = require("../MultiGuild/core/tenantTicketPanels");
const { publishMultiPanel } = require("../Utils/Ticket/ticketPanelPublishRuntime");

async function run(client) {
  await refreshTicketConfigCache().catch(() => null);
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!mainGuildId) return;
  const settings = getTicketSettingsSync(mainGuildId);
  if (settings.enabled !== true) return;

  const seeded = await ensureMainTicketPanelsSeeded({ client, publish: true }).catch((err) => {
    global.logger?.warn?.("[embeds/ticket] seed failed:", err?.message || err);
    return null;
  });
  if (seeded?.published?.ok) return;

  const bucket = seeded?.bucket || (await getGuildPanels(mainGuildId).catch(() => null));
  const multi = (bucket?.multis || []).find((m) => m.seedKey === MAIN_MULTI_SEED) || (bucket?.multis || [])[0];
  if (!multi?.id) return;
  await publishMultiPanel(client, mainGuildId, multi.id, { attachTicketGif: false }).catch((err) => {
    global.logger?.warn?.("[embeds/ticket] publish failed:", err?.message || err);
  });
}

module.exports = { name: "ticket", order: 20, section: "menu", run };
