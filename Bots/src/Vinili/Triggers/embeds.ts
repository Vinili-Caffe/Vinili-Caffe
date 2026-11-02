const Embeds = require("../Embeds/index") as typeof import("../Embeds/index");
const { isDiscordPanelEnabled } = require("../Utils/Config/discordPanelsConfig") as typeof import("../Utils/Config/discordPanelsConfig");
const { persistDiscordPanelRecipes, cleanupDisabledDiscordPanelMessages } = require("../Services/Community/discordPanelRecipePersistenceService") as typeof import("../Services/Community/discordPanelRecipePersistenceService");
const LOG_PANELS = String(process.env.LOG_PANELS || "0") === "1";

async function runPanelTask(section?, label?, runner?, client?) {
  const startedAt = Date.now();
  try {
    await runner(client);
    if (LOG_PANELS) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= 1000) global.logger?.info?.(`[PANELS:${section}] ${label} completed in ${elapsed}ms.`);
    }
  } catch (err) {
    global.logger.error(`[CLIENT READY:${section}] ${label} failed:`, err);
  }
}

async function runMenuAndSelectSections(client?) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_MENU)) {
    await runPanelTask("runMenuAndSelectSections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runMenuAndSelectSections finished in ${Date.now() - startedAt}ms.`);
}

async function runEmbedWithButtonsSections(client?) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_EMBED_WITH_BUTTONS)) {
    await runPanelTask("runEmbedWithButtonsSections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runEmbedWithButtonsSections finished in ${Date.now() - startedAt}ms.`);
}

async function runEmbedOnlySections(client?) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_EMBED_ONLY)) {
    await runPanelTask("runEmbedOnlySections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runEmbedOnlySections finished in ${Date.now() - startedAt}ms.`);
}

async function runAllClientReadyPanels(client?) {
  const startedAt = Date.now();
  const cleanup = await cleanupDisabledDiscordPanelMessages(client).catch((err?) => {
    global.logger?.warn?.("[PANELS] cleanup disabled failed:", err?.message || err);
    return null;
  });
  if (cleanup && !cleanup.skipped && (cleanup.deleted > 0 || cleanup.clearedSlots > 0)) {
    global.logger?.info?.(
      `[PANELS] disabled cleanup deleted=${cleanup.deleted} clearedSlots=${cleanup.clearedSlots}`,
    );
  }
  await runMenuAndSelectSections(client);
  await runEmbedWithButtonsSections(client);
  await runEmbedOnlySections(client);
  const recipes = await persistDiscordPanelRecipes({
    lastPublishAt: new Date(),
    lastCleanup: cleanup?.skipped ? undefined : cleanup,
  }).catch((err?) => {
    global.logger?.warn?.("[PANELS] recipe persist failed:", err?.message || err);
    return null;
  });
  if (recipes && !recipes.skipped) {
    global.logger?.info?.(
      `[PANELS] recipes saved enabled=${(recipes.enabledNames || []).join(",") || "(none)"} total=${recipes.recipes?.length || 0}`,
    );
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runAllClientReadyPanels finished in ${Date.now() - startedAt}ms.`);
}

export = {
  name: "startupPanelsInternal",
  once: false,
  async execute(client?) {
    await runAllClientReadyPanels(client);
  },
};
